# Quick Start

In this guide, we'll walk you through one of the simplest Llama Stack applications: **processing PDFs for RAG**.

## Step 1: Installation and Setup

For this guide, we will use [Ollama](https://ollama.com/) as the inference [provider](../providers/index.md#inference).

### i. Install and Start Ollama for Inference

Install Ollama by following the instructions on the [Ollama website](https://ollama.com/download).

To start Ollama run:
```bash
ollama run llama3.2:3b-instruct-fp16 --keepalive 60m
```

By default, Ollama keeps the model loaded in memory for 5 minutes which can be too short. We set the `--keepalive` flag to 60 minutes to ensure the model remains loaded for sometime.

### ii. Install `uv` to Manage your Python packages

Install [uv](https://docs.astral.sh/uv/) to setup your virtual environment

::::{tab-set}

:::{tab-item} macOS and Linux
Use `curl` to download the script and execute it with `sh`:
```console
curl -LsSf https://astral.sh/uv/install.sh | sh
```
:::

:::{tab-item} Windows
Use `irm` to download the script and execute it with `iex`:

```console
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```
:::
::::

### iii. Setup your Virtual Environment
```bash
uv venv --python 3.10
source .venv/bin/activate
```
## Step 2: Install Llama Stack and some Additional Dependencies

Install Llama Stack and Ollama using pip (note that you need Python 3.10 or later):
```bash
uv pip install faiss-cpu llama-stack ollama aiosqlite openai chardet datasets sentence_transformers pypdf opentelemetry-sdk opentelemetry-exporter-otlp-proto-http mcp autoevals cprint
```

## Step 3: Create your Llama Stack RAG Application

### Create the Script

Copy the code below into a file called `llama_stack_rag_demo.py`.
```python
import os
from termcolor import cprint
from llama_stack.distribution.library_client import LlamaStackAsLibraryClient
from llama_stack_client.types import Document

os.environ["INFERENCE_MODEL"] = "llama3.2:3b-instruct-fp16"

client = LlamaStackAsLibraryClient("ollama")

vector_db = "faiss"
vector_db_id = "test-vector-db"
model_id = "llama3.2:3b-instruct-fp16"
query = "Can you give me the arxiv link for Lora Fine Tuning in Pytorch?"

document = Document(
    document_id="document_1",
    content=f"https://raw.githubusercontent.com/pytorch/torchtune/main/docs/source/tutorials/lora_finetune.rst",
    mime_type="text/plain",
    metadata={},
)

_ = client.initialize()
client.vector_dbs.register(
    provider_id=vector_db,
    vector_db_id=vector_db_id,
    embedding_model="all-MiniLM-L6-v2",
    embedding_dimension=384,
)

client.tool_runtime.rag_tool.insert(
    documents=[document],
    vector_db_id=vector_db_id,
    chunk_size_in_tokens=50,
)

response = client.tool_runtime.rag_tool.query(
    vector_db_ids=[vector_db_id],
    content=query,
)

cprint("" + "-" * 50, "yellow")
cprint(f"Query> {query}", "red")
cprint("" + "-" * 50, "yellow")
for chunk in response.content:
    cprint(f"Chunk ID> {chunk.text}", "green")
    cprint("" + "-" * 50, "yellow")
```

## Step 4: Run the Application

### Run the Script

Now just run the script with `uv`
```bash
uv run python llama_stack_rag_demo.py
```
Which will output something like:
```markdown
--------------------------------------------------
Query> Can you give me the arxiv link for Lora Fine Tuning in Pytorch?
--------------------------------------------------
Chunk ID> knowledge_search tool found 5 chunks:
BEGIN of knowledge_search tool results.

--------------------------------------------------
Chunk ID> Result 1:
Document_id:docum
Content: .. _lora_finetune_label:

============================
Fine-Tuning Llama2 with LoRA
============================

This guide will teach you about `LoRA <https://arxiv.org/abs/2106.09685>`_, a

--------------------------------------------------
```

## Next Steps

Now that you have a basic understanding of how to set up and run a Llama Stack application,
we can move on to a full [end-to-end example](e2e_quickstart.md) where you can see how to set up a full stack
application with both the server and the client.

```{toctree}
:hidden:
:maxdepth: 0

e2e_quickstart
```
