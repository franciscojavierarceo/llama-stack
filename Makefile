ROOT_DIR := $(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))
OS := linux
ifeq ($(shell uname -s), Darwin)
	OS = osx
endif

PYTHON_VERSION = ${shell python --version | grep -Eo '[0-9]\.[0-9]+'}
PYTHON_VERSIONS := 3.10 3.11

export INFERENCE_MODEL="meta-llama/Llama-3.2-3B-Instruct"
export OLLAMA_INFERENCE_MODEL="llama3.2:3b-instruct-fp16"
export LLAMA_STACK_PORT=8321
export EMBEDDING_MODELS="all-MiniLM-L6-v2"
export LLAMA_STACK_CONFIG=ollama

build-dev:
	uv venv .venv
	uv sync --extra dev --extra test
	uv pip install -e .
	. .venv/bin/activate
	uv pip install sqlite-vec chardet datasets sentence_transformers pypdf faiss-cpu mcp autoevals

build-ollama: fix-line-endings
	llama stack build --template ollama --image-type venv

run-ollama:
    llama stack run ./llama_stack/templates/ollama/run.yaml \
      --port $LLAMA_STACK_PORT \
      --env INFERENCE_MODEL=$INFERENCE_MODEL \
      --env SAFETY_MODEL=$SAFETY_MODEL \
      --env OLLAMA_URL=http://localhost:11434

fix-line-endings:
	sed -i '' 's/\r$$//' llama_stack/distribution/common.sh
	sed -i '' 's/\r$$//' llama_stack/distribution/build_venv.sh
	sed -i '' 's/\r$$//' ./scripts/unit-tests.sh
	sed -i '' 's/\r$$//' ./docs/openapi_generator/run_openapi_generator.sh

test-sqlite-vec:
	pytest tests/unit/providers/vector_io/test_sqlite_vec.py \
	-v -s --tb=short --disable-warnings --asyncio-mode=auto

test-ollama-vector-integration:
	INFERENCE_MODEL=llama3.2:3b-instruct-fp16 LLAMA_STACK_CONFIG=ollama \
	pytest -s -v tests/api/vector_io/ \
	--stack-config=inference=sentence-transformers,vector_io=sqlite-vec \
	--embedding-model=$EMBEDDING_MODELS

serve-ollama:
	ollama run $OLLAMA_INFERENCE_MODEL --keepalive 24h
