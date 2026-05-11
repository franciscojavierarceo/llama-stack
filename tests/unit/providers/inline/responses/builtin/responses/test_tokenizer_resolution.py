# Copyright (c) The OGX Contributors.
# All rights reserved.
#
# This source code is licensed under the terms described in the LICENSE file in
# the root directory of this source tree.

import pytest

from ogx.providers.inline.responses.builtin.config import CompactionConfig


class TestCompactionConfigDefaults:
    def test_model_tokenizer_mappings_has_defaults(self):
        config = CompactionConfig()
        assert "llama" in config.model_tokenizer_mappings
        assert config.model_tokenizer_mappings["llama"] == "cl100k_base"

    def test_model_tokenizer_mappings_customizable(self):
        config = CompactionConfig(model_tokenizer_mappings={"mymodel": "o200k_base"})
        assert config.model_tokenizer_mappings == {"mymodel": "o200k_base"}
        assert "llama" not in config.model_tokenizer_mappings


from ogx.providers.inline.responses.builtin.responses.openai_responses import OpenAIResponsesImpl
from ogx_api.common.errors import InvalidParameterError


class TestResolveEncoding:
    """Tests for _resolve_encoding() — the 5-step tokenizer resolution chain."""

    def _make_impl(self, **config_kwargs) -> OpenAIResponsesImpl:
        """Create a minimal OpenAIResponsesImpl with just compaction_config set."""
        config = CompactionConfig(**config_kwargs)
        impl = object.__new__(OpenAIResponsesImpl)
        impl.compaction_config = config
        return impl

    def test_step1_per_request_override(self):
        impl = self._make_impl()
        encoding = impl._resolve_encoding("some-model", extra_body={"tokenizer_encoding": "cl100k_base"})
        assert encoding is not None
        assert encoding.name == "cl100k_base"

    def test_step1_per_request_invalid_raises(self):
        impl = self._make_impl()
        with pytest.raises(InvalidParameterError, match="tokenizer_encoding"):
            impl._resolve_encoding("some-model", extra_body={"tokenizer_encoding": "not_a_real_encoding"})

    def test_step1_per_request_beats_admin_default(self):
        impl = self._make_impl(tokenizer_encoding="o200k_base")
        encoding = impl._resolve_encoding("some-model", extra_body={"tokenizer_encoding": "cl100k_base"})
        assert encoding.name == "cl100k_base"

    def test_step2_admin_default(self):
        impl = self._make_impl(tokenizer_encoding="o200k_base")
        encoding = impl._resolve_encoding("some-model")
        assert encoding is not None
        assert encoding.name == "o200k_base"

    def test_step2_admin_invalid_raises(self):
        impl = self._make_impl(tokenizer_encoding="not_a_real_encoding")
        with pytest.raises(InvalidParameterError, match="compaction_config.tokenizer_encoding"):
            impl._resolve_encoding("some-model")

    def test_step3_tiktoken_builtin_openai_model(self):
        impl = self._make_impl()
        encoding = impl._resolve_encoding("gpt-4o")
        assert encoding is not None

    def test_step3_tiktoken_strips_provider_prefix(self):
        impl = self._make_impl()
        encoding = impl._resolve_encoding("openai/gpt-4o")
        assert encoding is not None

    def test_step4_model_family_mapping_llama(self):
        impl = self._make_impl()
        encoding = impl._resolve_encoding("ollama/llama3.2:3b-instruct-fp16")
        assert encoding is not None
        assert encoding.name == "cl100k_base"

    def test_step4_model_family_mapping_case_insensitive(self):
        impl = self._make_impl()
        encoding = impl._resolve_encoding("Llama-3.1-70B")
        assert encoding is not None
        assert encoding.name == "cl100k_base"

    def test_step4_model_family_custom_mapping(self):
        impl = self._make_impl(model_tokenizer_mappings={"mymodel": "o200k_base"})
        encoding = impl._resolve_encoding("mymodel-v2")
        assert encoding is not None
        assert encoding.name == "o200k_base"

    def test_step5_character_fallback_returns_none(self):
        impl = self._make_impl(model_tokenizer_mappings={})
        encoding = impl._resolve_encoding("totally-unknown-model-xyz")
        assert encoding is None
