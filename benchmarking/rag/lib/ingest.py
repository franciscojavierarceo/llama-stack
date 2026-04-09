# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the terms described in the LICENSE file in
# the root directory of this source tree.

"""Corpus upload: Files API -> Vector Stores API (batched, checkpointed)."""

from __future__ import annotations

import io
import logging  # allow-direct-logging
import time

from openai import OpenAI

from .utils import Checkpoint, IDMapping, batched, progress_bar, retry_with_backoff

logger = logging.getLogger("rag-benchmarks")

UPLOAD_BATCH_SIZE = 50  # Files per checkpoint save
ATTACH_BATCH_SIZE = 500  # Max file IDs per file_batches.create
POLL_INTERVAL = 2.0


def ingest_corpus(
    client: OpenAI,
    corpus: dict[str, dict],
    vector_store_name: str,
    checkpoint_path: str,
    resume: bool = False,
) -> tuple[str, IDMapping]:
    """Upload a corpus and create a vector store.

    Args:
        client: OpenAI client (points at either OpenAI SaaS or Llama Stack).
        corpus: {doc_id: {"title": ..., "text": ...}}
        vector_store_name: Name for the vector store.
        checkpoint_path: Path for checkpoint JSON.
        resume: If True, skip already-uploaded files and reuse existing vector store.

    Returns:
        (vector_store_id, id_mapping)
    """
    ckpt = Checkpoint(checkpoint_path)
    mapping = IDMapping(ckpt)

    # --- Create or reuse vector store ---
    vs_id = ckpt.get("vector_store_id")
    if resume and vs_id:
        logger.info(f"Resuming with existing vector store: {vs_id}")
    else:
        vs = client.vector_stores.create(name=vector_store_name)
        vs_id = vs.id
        ckpt.set("vector_store_id", vs_id)
        logger.info(f"Created vector store: {vs_id}")

    # --- Upload files ---
    to_upload = {doc_id: doc for doc_id, doc in corpus.items() if doc_id not in mapping.uploaded_doc_ids}

    if not to_upload:
        logger.info(f"All {len(corpus)} documents already uploaded.")
        return vs_id, mapping

    logger.info(f"Uploading {len(to_upload)} documents ({len(mapping)} already done)...")

    # Phase 1: Upload all files to Files API (checkpointed per small batch)
    unattached_ids: list[str] = list(ckpt.get("unattached_file_ids", []))
    doc_items = list(to_upload.items())
    num_upload_batches = (len(doc_items) + UPLOAD_BATCH_SIZE - 1) // UPLOAD_BATCH_SIZE

    for batch in progress_bar(
        batched(doc_items, UPLOAD_BATCH_SIZE),
        desc="Uploading files",
        total=num_upload_batches,
    ):
        for doc_id, doc in batch:
            title = doc.get("title", "")
            text = doc.get("text", "")
            content = f"{title}\n\n{text}" if title else text
            if not content.strip():
                logger.debug(f"Skipping empty document {doc_id}")
                continue
            filename = f"{doc_id}.txt"

            file_obj = retry_with_backoff(
                lambda c=content, f=filename: client.files.create(
                    file=(f, io.BytesIO(c.encode("utf-8"))),
                    purpose="assistants",
                )
            )
            mapping.add(doc_id, file_obj.id)
            unattached_ids.append(file_obj.id)

        # Save unattached IDs so we can resume attachment if interrupted
        ckpt.set("unattached_file_ids", unattached_ids)

    # Phase 2: Attach files to vector store in large batches
    if unattached_ids:
        num_attach_batches = (len(unattached_ids) + ATTACH_BATCH_SIZE - 1) // ATTACH_BATCH_SIZE
        logger.info(f"Attaching {len(unattached_ids)} files to vector store in {num_attach_batches} batches...")

        for attach_batch in progress_bar(
            batched(unattached_ids, ATTACH_BATCH_SIZE),
            desc="Attaching batches",
            total=num_attach_batches,
        ):
            retry_with_backoff(
                lambda fids=attach_batch: client.vector_stores.file_batches.create(
                    vector_store_id=vs_id,
                    file_ids=fids,
                )
            )
            _poll_vector_store(client, vs_id)

        # Clear unattached list
        ckpt.set("unattached_file_ids", [])

    logger.info(f"Ingestion complete. {len(mapping)} documents in vector store {vs_id}.")
    return vs_id, mapping


def _poll_vector_store(client: OpenAI, vs_id: str, timeout: float = 600) -> None:
    """Poll until vector store processing is complete."""
    start = time.time()
    while time.time() - start < timeout:
        vs = client.vector_stores.retrieve(vs_id)
        counts = vs.file_counts
        if counts.in_progress == 0:
            if counts.failed > 0:
                logger.warning(f"Vector store {vs_id}: {counts.failed} files failed")
            return
        time.sleep(POLL_INTERVAL)
    logger.warning(f"Vector store {vs_id} polling timed out after {timeout}s")
