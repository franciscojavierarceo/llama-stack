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
