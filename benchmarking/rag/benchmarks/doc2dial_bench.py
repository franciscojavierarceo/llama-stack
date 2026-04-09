# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the terms described in the LICENSE file in
# the root directory of this source tree.

"""Doc2Dial benchmark — document-grounded dialogue evaluation."""

from __future__ import annotations

import json
import logging  # allow-direct-logging
from collections import defaultdict

from datasets import load_dataset
from lib.ingest import ingest_corpus
from lib.metrics import answer_metrics
from lib.query import rag_conversation
from lib.utils import Checkpoint, IDMapping

from benchmarks.base import BenchmarkRunner

logger = logging.getLogger("rag-benchmarks")

DEFAULT_MAX_CONVERSATIONS = 200


class Doc2DialBenchmark(BenchmarkRunner):
    """Doc2Dial document-grounded dialogue benchmark."""

    name = "doc2dial"

    def __init__(self, max_conversations: int | None = None, **kwargs):
        super().__init__(**kwargs)
        self.max_conversations = max_conversations or DEFAULT_MAX_CONVERSATIONS
        self.corpus: dict[str, dict] = {}
        self.conversations: list[dict] = []
        self.vector_store_id: str | None = None
        self.mapping: IDMapping | None = None

    def download(self) -> None:
        cache_dir = str(self.data_dir / "doc2dial")
        self._dataset = load_dataset("IBM/doc2dial", cache_dir=cache_dir)
        logger.info("Downloaded Doc2Dial dataset")

    def load_data(self) -> None:
        # Extract source documents
        if "document" in self._dataset:
            for item in self._dataset["document"]:
                doc_id = item.get("doc_id", str(len(self.corpus)))
                self.corpus[doc_id] = {
                    "title": item.get("title", ""),
                    "text": item.get("text", item.get("document_text", "")),
                }

        # Extract dialogues
        split = "validation" if "validation" in self._dataset else "test"
        if split not in self._dataset:
            split = "train"

        # Group by dialogue_id
        dial_turns: dict[str, list] = defaultdict(list)
        for item in self._dataset[split]:
            dial_id = item.get("dial_id", str(len(dial_turns)))
            dial_turns[dial_id].append(item)

        # If dataset is flat (one row per dialogue with turns embedded)
        if not dial_turns and split in self._dataset:
            for idx, item in enumerate(self._dataset[split]):
                dial_id = item.get("dial_id", str(idx))
                dial_turns[dial_id].append(item)

        # Build conversation list
        dial_ids = sorted(dial_turns.keys())[: self.max_conversations]
        for dial_id in dial_ids:
            items = dial_turns[dial_id]

            # Handle both flat and nested turn formats
            turns = []
            for item in items:
                if "turns" in item:
                    # Nested format: each item has a list of turns
                    for turn in item["turns"]:
                        if turn.get("role") == "agent" or turn.get("role") == "system":
                            # Agent responses are what we evaluate
                            turns.append(
                                {
                                    "query": turn.get("user_query", turn.get("context", "")),
                                    "answer": turn.get("utterance", turn.get("response", "")),
                                    "doc_id": item.get("doc_id", ""),
                                    "span": turn.get("reference", {}).get("sp", []),
                                }
                            )
                else:
                    # Flat format: each item is a turn
                    turns.append(
                        {
                            "query": item.get("question", item.get("user_query", "")),
                            "answer": item.get("answer", item.get("response", "")),
                            "doc_id": item.get("doc_id", ""),
                            "span": item.get("grounding_span", ""),
                        }
                    )

            if turns:
                self.conversations.append(
                    {
                        "dial_id": dial_id,
                        "turns": turns,
                    }
                )

        # If no separate document split, extract from conversations
        if not self.corpus:
            for conv in self.conversations:
                for turn in conv["turns"]:
                    doc_id = turn.get("doc_id", "")
                    if doc_id and doc_id not in self.corpus:
                        self.corpus[doc_id] = {"title": doc_id, "text": ""}

        logger.info(
            f"Loaded Doc2Dial: {len(self.corpus)} documents, "
            f"{len(self.conversations)} conversations, "
            f"{sum(len(c['turns']) for c in self.conversations)} total turns"
        )

    def ingest(self) -> None:
        if not self.corpus:
            logger.warning("No documents to ingest")
            return

        checkpoint_path = str(self.output_dir / "checkpoint.json")
        self.vector_store_id, self.mapping = ingest_corpus(
            client=self.client,
            corpus=self.corpus,
            vector_store_name="doc2dial",
            checkpoint_path=checkpoint_path,
            resume=self.resume,
        )

    def evaluate(self) -> dict:
        if not self.vector_store_id:
            return {"error": "No vector store available"}

        all_predictions = {}
        all_ground_truths = {}
        conversations_processed = 0

        ckpt = Checkpoint(str(self.output_dir / "eval_checkpoint.json"))
        completed_dials = set(ckpt.get("completed_dialogues", []))

        for conv in self.conversations:
            dial_id = conv["dial_id"]
            if dial_id in completed_dials:
                continue

            turns_input = [
                {"query_id": f"{dial_id}_{i}", "query": t["query"]}
                for i, t in enumerate(conv["turns"])
                if t["query"]  # skip empty queries
            ]

            if not turns_input:
                continue

            try:
                results = rag_conversation(
                    client=self.client,
                    model=self.model,
                    turns=turns_input,
                    vector_store_ids=[self.vector_store_id],
                    mapping=self.mapping,
                    max_num_results=10,
                    search_mode=self.search_mode,
                )
            except Exception as e:
                logger.error(f"Conversation {dial_id} failed: {e}")
                continue

            valid_turns = [t for t in conv["turns"] if t["query"]]
            for i, (turn, result) in enumerate(zip(valid_turns, results, strict=False)):
                qid = f"{dial_id}_{i}"
                all_predictions[qid] = result["answer"]
                all_ground_truths[qid] = turn["answer"]

            conversations_processed += 1
            completed_dials.add(dial_id)
            ckpt.set("completed_dialogues", list(completed_dials))

            if conversations_processed % 20 == 0:
                logger.info(f"Processed {conversations_processed}/{len(self.conversations)} dialogues")

        # Compute metrics
        metrics = answer_metrics(all_predictions, all_ground_truths)
        metrics["dataset"] = "doc2dial"
        metrics["num_conversations"] = conversations_processed
        metrics["num_documents"] = len(self.corpus)
        metrics["search_mode"] = self.search_mode or "default"

        # Save per-query results
        per_query_path = self.output_dir / "per_query_results.json"
        per_query_path.write_text(
            json.dumps(
                {
                    qid: {"prediction": all_predictions.get(qid, ""), "ground_truth": all_ground_truths.get(qid, "")}
                    for qid in all_predictions
                },
                indent=2,
            )
        )

        return metrics
