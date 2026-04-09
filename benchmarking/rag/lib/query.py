# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the terms described in the LICENSE file in
# the root directory of this source tree.

"""End-to-end RAG evaluation via Responses API with file_search tool."""

from __future__ import annotations

import logging  # allow-direct-logging

from openai import OpenAI

from .utils import IDMapping, progress_bar, retry_with_backoff

logger = logging.getLogger("rag-benchmarks")


def rag_query(
    client: OpenAI,
    model: str,
    query: str,
    vector_store_ids: list[str],
    mapping: IDMapping,
    max_num_results: int = 10,
    previous_response_id: str | None = None,
    search_mode: str | None = None,
) -> dict:
    """Execute a single RAG query via Responses API.

    Returns:
        {
            "answer": str,
            "response_id": str,
            "retrieved_docs": {doc_id: score},
            "retrieved_chunks": [{"doc_id": ..., "text": ..., "score": ...}],
        }
    """
    tool_config = {
        "type": "file_search",
        "vector_store_ids": vector_store_ids,
        "max_num_results": max_num_results,
    }
    if search_mode:
        tool_config["search_mode"] = search_mode

    kwargs: dict = {
        "model": model,
        "input": query,
        "tools": [tool_config],
        "include": ["file_search_call.results"],
    }
    if previous_response_id:
        kwargs["previous_response_id"] = previous_response_id

    response = retry_with_backoff(lambda: client.responses.create(**kwargs))

    # Extract answer text and retrieved chunks
    answer = ""
    retrieved_docs: dict[str, float] = {}
    retrieved_chunks: list[dict] = []

    for item in response.output:
        if item.type == "message":
            for content in item.content:
                if content.type == "output_text":
                    answer += content.text
        elif item.type == "file_search_call":
            for result in getattr(item, "results", []) or []:
                file_id = result.file_id
                doc_id = mapping.doc_id(file_id) if mapping else file_id
                score = result.score
                text = result.text

                if doc_id and (doc_id not in retrieved_docs or score > retrieved_docs[doc_id]):
                    retrieved_docs[doc_id] = score
                retrieved_chunks.append(
                    {
                        "doc_id": doc_id or file_id,
                        "text": text,
                        "score": score,
                    }
                )

    return {
        "answer": answer.strip(),
        "response_id": response.id,
        "retrieved_docs": retrieved_docs,
        "retrieved_chunks": retrieved_chunks,
    }


def rag_query_batch(
    client: OpenAI,
    model: str,
    queries: dict[str, str],
    vector_store_ids: list[str],
    mapping: IDMapping,
    max_num_results: int = 10,
    search_mode: str | None = None,
) -> dict[str, dict]:
    """Run RAG queries for a batch of independent questions.

    Returns:
        {query_id: rag_query result dict}
    """
    results = {}
    for qid, query_text in progress_bar(queries.items(), desc="RAG queries", total=len(queries)):
        try:
            result = rag_query(
                client=client,
                model=model,
                query=query_text,
                vector_store_ids=vector_store_ids,
                mapping=mapping,
                max_num_results=max_num_results,
                search_mode=search_mode,
            )
            results[qid] = result
        except Exception as e:
            logger.error(f"RAG query failed for {qid}: {e}")
            results[qid] = {"answer": "", "response_id": None, "retrieved_docs": {}, "retrieved_chunks": []}
    return results


def rag_conversation(
    client: OpenAI,
    model: str,
    turns: list[dict],
    vector_store_ids: list[str],
    mapping: IDMapping,
    max_num_results: int = 10,
    search_mode: str | None = None,
) -> list[dict]:
    """Process a multi-turn conversation sequentially, threading via previous_response_id.

    Args:
        turns: [{"query_id": ..., "query": ...}, ...]

    Returns:
        List of rag_query result dicts, one per turn.
    """
    results = []
    prev_response_id = None

    for turn in turns:
        try:
            result = rag_query(
                client=client,
                model=model,
                query=turn["query"],
                vector_store_ids=vector_store_ids,
                mapping=mapping,
                max_num_results=max_num_results,
                previous_response_id=prev_response_id,
                search_mode=search_mode,
            )
            prev_response_id = result["response_id"]
        except Exception as e:
            logger.error(f"Conversation turn {turn.get('query_id')} failed: {e}")
            result = {"answer": "", "response_id": None, "retrieved_docs": {}, "retrieved_chunks": []}
        results.append(result)

    return results
