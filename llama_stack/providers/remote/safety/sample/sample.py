# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the terms described in the LICENSE file in
# the root directory of this source tree.

from llama_stack.apis.safety import Safety
from llama_stack.apis.shields import Shield

from .config import SampleConfig


class SampleSafetyImpl(Safety):
    def __init__(self, config: SampleConfig):
        self.config = config

    async def register_shield(self, shield: Shield) -> None:
        # these are the safety shields the Llama Stack will use to route requests to this provider
        # perform validation here if necessary
        pass

    async def initialize(self):
        pass
