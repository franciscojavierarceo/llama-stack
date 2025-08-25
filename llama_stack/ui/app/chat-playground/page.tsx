"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { Chat } from "@/components/chat-playground/chat";
import { type Message } from "@/components/chat-playground/chat-message";
import { VectorDBCreator } from "@/components/chat-playground/vector-db-creator";
import { useAuthClient } from "@/hooks/use-auth-client";
import type { Model } from "llama-stack-client/resources/models";
import type { TurnCreateParams } from "llama-stack-client/resources/agents/turn";
import {
  SessionUtils,
  type ChatSession,
} from "@/components/chat-playground/conversations";
export default function ChatPlaygroundPage() {
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(
    null
  );
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [agents, setAgents] = useState<
    Array<{
      agent_id: string;
      agent_config?: {
        agent_name?: string;
        name?: string;
        instructions?: string;
      };
      [key: string]: unknown;
    }>
  >([]);
  const [selectedAgentConfig, setSelectedAgentConfig] = useState<{
    toolgroups?: Array<
      string | { name: string; args: Record<string, unknown> }
    >;
  } | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentInstructions, setNewAgentInstructions] = useState(
    "You are a helpful assistant."
  );
  const [selectedToolgroups, setSelectedToolgroups] = useState<string[]>([]);
  const [availableToolgroups, setAvailableToolgroups] = useState<
    Array<{
      identifier: string;
      provider_id: string;
      type: string;
      provider_resource_id?: string;
    }>
  >([]);
  const [showCreateVectorDB, setShowCreateVectorDB] = useState(false);
  const [availableVectorDBs, setAvailableVectorDBs] = useState<
    Array<{
      identifier: string;
      vector_db_name?: string;
      embedding_model: string;
    }>
  >([]);
  const [uploadNotification, setUploadNotification] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error" | "loading";
  }>({ show: false, message: "", type: "success" });
  const [selectedVectorDBs, setSelectedVectorDBs] = useState<string[]>([]);
  const client = useAuthClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  const isModelsLoading = modelsLoading ?? true;

  const loadAgentConfig = useCallback(
    async (agentId: string) => {
      try {
        console.log("Loading agent config for:", agentId);

        // try to load from cache first
        const cachedConfig = SessionUtils.loadAgentConfig(agentId);
        if (cachedConfig) {
          console.log("✅ Loaded agent config from cache:", cachedConfig);
          setSelectedAgentConfig({
            toolgroups: cachedConfig.toolgroups,
          });
          return;
        }

        console.log("📡 Fetching agent config from API...");
        const agentDetails = await client.agents.retrieve(agentId);
        console.log("Agent details retrieved:", agentDetails);
        console.log("Agent config:", agentDetails.agent_config);
        console.log("Agent toolgroups:", agentDetails.agent_config?.toolgroups);

        // cache the config
        SessionUtils.saveAgentConfig(agentId, {
          ...agentDetails.agent_config,
          toolgroups: agentDetails.agent_config?.toolgroups,
        });

        setSelectedAgentConfig({
          toolgroups: agentDetails.agent_config?.toolgroups,
        });
      } catch (error) {
        console.error("Error loading agent config:", error);
        setSelectedAgentConfig(null);
      }
    },
    [client]
  );

  const createDefaultSession = useCallback(
    async (agentId: string) => {
      try {
        const response = await client.agents.session.create(agentId, {
          session_name: "Default Session",
        });

        const defaultSession: ChatSession = {
          id: response.session_id,
          name: "Default Session",
          messages: [],
          selectedModel: selectedModel, // Use current selected model
          systemMessage: "You are a helpful assistant.",
          agentId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        setCurrentSession(defaultSession);
        console.log(
          `💾 Saving default session ID for agent ${agentId}:`,
          defaultSession.id
        );
        SessionUtils.saveCurrentSessionId(defaultSession.id, agentId);
        // cache entire session data
        SessionUtils.saveSessionData(agentId, defaultSession);
      } catch (error) {
        console.error("Error creating default session:", error);
      }
    },
    [client, selectedModel]
  );

  const loadSessionMessages = useCallback(
    async (agentId: string, sessionId: string): Promise<Message[]> => {
      try {
        const session = await client.agents.session.retrieve(
          agentId,
          sessionId
        );

        if (!session || !session.turns || !Array.isArray(session.turns)) {
          return [];
        }

        const messages: Message[] = [];
        for (const turn of session.turns) {
          // add user messages
          if (turn.input_messages && Array.isArray(turn.input_messages)) {
            for (const input of turn.input_messages) {
              if (input.role === "user" && input.content) {
                messages.push({
                  id: `${turn.turn_id}-user-${messages.length}`,
                  role: "user",
                  content:
                    typeof input.content === "string"
                      ? input.content
                      : JSON.stringify(input.content),
                  createdAt: new Date(turn.started_at || Date.now()),
                });
              }
            }
          }

          // add assistant message from output_message
          if (turn.output_message && turn.output_message.content) {
            messages.push({
              id: `${turn.turn_id}-assistant-${messages.length}`,
              role: "assistant",
              content:
                typeof turn.output_message.content === "string"
                  ? turn.output_message.content
                  : JSON.stringify(turn.output_message.content),
              createdAt: new Date(
                turn.completed_at || turn.started_at || Date.now()
              ),
            });
          }
        }

        return messages;
      } catch (error) {
        console.error("Error loading session messages:", error);
        return [];
      }
    },
    [client]
  );

  const loadAgentSessions = useCallback(
    async (agentId: string) => {
      try {
        console.log("Loading sessions for agent:", agentId);
        const response = await client.agents.session.list(agentId);
        console.log("Available sessions:", response.data);

        if (
          response.data &&
          Array.isArray(response.data) &&
          response.data.length > 0
        ) {
          // check for a previously saved session ID for this specific agent
          const savedSessionId = SessionUtils.loadCurrentSessionId(agentId);
          console.log(`Saved session ID for agent ${agentId}:`, savedSessionId);

          // try to load cached session data first
          if (savedSessionId) {
            const cachedSession = SessionUtils.loadSessionData(
              agentId,
              savedSessionId
            );
            if (cachedSession) {
              console.log("✅ Loaded session from cache:", cachedSession.id);
              setCurrentSession(cachedSession);
              SessionUtils.saveCurrentSessionId(cachedSession.id, agentId);
              return;
            }
            console.log("📡 Cache miss, fetching session from API...");
          }

          let sessionToLoad = response.data[0] as {
            session_id: string;
            session_name?: string;
            started_at?: string;
          };
          console.log(
            "Default session to load (first in list):",
            sessionToLoad.session_id
          );

          // try to find saved session id in available sessions
          if (savedSessionId) {
            const foundSession = response.data.find(
              (s: { [key: string]: unknown }) =>
                (s as { session_id: string }).session_id === savedSessionId
            );
            console.log("Found saved session in list:", foundSession);
            if (foundSession) {
              sessionToLoad = foundSession as {
                session_id: string;
                session_name?: string;
                started_at?: string;
              };
              console.log(
                "✅ Restored previously selected session:",
                savedSessionId
              );
            } else {
              console.log(
                "❌ Previously selected session not found, using latest session"
              );
            }
          } else {
            console.log("❌ No saved session ID found, using latest session");
          }

          const messages = await loadSessionMessages(
            agentId,
            sessionToLoad.session_id
          );

          const session: ChatSession = {
            id: sessionToLoad.session_id,
            name: sessionToLoad.session_name || "Session",
            messages,
            selectedModel: selectedModel || "", // Preserve current model or use empty
            systemMessage: "You are a helpful assistant.",
            agentId,
            createdAt: sessionToLoad.started_at
              ? new Date(sessionToLoad.started_at).getTime()
              : Date.now(),
            updatedAt: Date.now(),
          };

          setCurrentSession(session);
          console.log(`💾 Saving session ID for agent ${agentId}:`, session.id);
          SessionUtils.saveCurrentSessionId(session.id, agentId);
          // cache session data
          SessionUtils.saveSessionData(agentId, session);
        } else {
          // no sessions, create a new one
          await createDefaultSession(agentId);
        }
      } catch (error) {
        console.error("Error loading agent sessions:", error);
        // fallback to creating a new session
        await createDefaultSession(agentId);
      }
    },
    [client, loadSessionMessages, createDefaultSession, selectedModel]
  );

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setAgentsLoading(true);
        const agentList = await client.agents.list();
        setAgents(
          (agentList.data as Array<{
            agent_id: string;
            agent_config?: {
              agent_name?: string;
              name?: string;
              instructions?: string;
            };
            [key: string]: unknown;
          }>) || []
        );

        if (agentList.data && agentList.data.length > 0) {
          // check if there's a previously selected agent
          const savedAgentId = SessionUtils.loadCurrentAgentId();

          let agentToSelect = agentList.data[0] as {
            agent_id: string;
            agent_config?: {
              agent_name?: string;
              name?: string;
              instructions?: string;
            };
            [key: string]: unknown;
          };

          // if we have a saved agent ID, find it in the available agents
          if (savedAgentId) {
            const foundAgent = agentList.data.find(
              (a: { [key: string]: unknown }) =>
                (a as { agent_id: string }).agent_id === savedAgentId
            );
            if (foundAgent) {
              agentToSelect = foundAgent as typeof agentToSelect;
            } else {
              console.log("Previously slelected agent not found:");
            }
          }
          setSelectedAgentId(agentToSelect.agent_id);
          SessionUtils.saveCurrentAgentId(agentToSelect.agent_id);
          // load agent config immediately
          await loadAgentConfig(agentToSelect.agent_id);
          // Note: loadAgentSessions will be called after models are loaded
        }
      } catch (error) {
        console.error("Error fetching agents:", error);
      } finally {
        setAgentsLoading(false);
      }
    };

    fetchAgents();

    // fetch available toolgroups
    const fetchToolgroups = async () => {
      try {
        console.log("Fetching toolgroups...");
        const toolgroups = await client.toolgroups.list();
        console.log("Toolgroups response:", toolgroups);

        // The client returns data directly, not wrapped in .data
        const toolGroupsArray = Array.isArray(toolgroups)
          ? toolgroups
          : toolgroups &&
              typeof toolgroups === "object" &&
              "data" in toolgroups &&
              Array.isArray((toolgroups as { data: unknown }).data)
            ? (
                toolgroups as {
                  data: Array<{
                    identifier: string;
                    provider_id: string;
                    type: string;
                    provider_resource_id?: string;
                  }>;
                }
              ).data
            : [];

        if (toolGroupsArray && Array.isArray(toolGroupsArray)) {
          setAvailableToolgroups(toolGroupsArray);
          console.log("Set toolgroups:", toolGroupsArray);
        } else {
          console.error("Invalid toolgroups data format:", toolgroups);
        }
      } catch (error) {
        console.error("Error fetching toolgroups:", error);
        if (error instanceof Error) {
          console.error("Error details:", {
            name: error.name,
            message: error.message,
            stack: error.stack,
          });
        }
      }
    };

    fetchToolgroups();

    // fetch available vector DBs
    const fetchVectorDBs = async () => {
      try {
        console.log("Fetching vector DBs...");
        const vectorDBs = await client.vectorDBs.list();
        console.log("Vector DBs response:", vectorDBs);

        // The API returns the array directly
        const vectorDBsArray = Array.isArray(vectorDBs) ? vectorDBs : [];

        if (vectorDBsArray && Array.isArray(vectorDBsArray)) {
          setAvailableVectorDBs(vectorDBsArray);
          console.log("Set vector DBs:", vectorDBsArray);
        } else {
          console.error("Invalid vector DBs data format:", vectorDBs);
        }
      } catch (error) {
        console.error("Error fetching vector DBs:", error);
      }
    };

    fetchVectorDBs();
  }, [client, loadAgentSessions, loadAgentConfig]);

  const createNewAgent = useCallback(
    async (
      name: string,
      instructions: string,
      model: string,
      toolgroups: string[] = [],
      vectorDBs: string[] = []
    ) => {
      try {
        console.log("Creating agent with toolgroups:", toolgroups);
        console.log("Creating agent with vector DBs:", vectorDBs);

        // Process toolgroups to add RAG configuration if vector DBs are selected
        const processedToolgroups = toolgroups.map(toolgroup => {
          if (toolgroup === "builtin::rag" && vectorDBs.length > 0) {
            // Configure RAG tool with selected vector DBs
            return {
              name: "builtin::rag/knowledge_search",
              args: {
                vector_db_ids: vectorDBs,
              },
            };
          }
          return toolgroup;
        });

        const agentConfig = {
          model,
          instructions,
          name: name || undefined,
          enable_session_persistence: true,
          toolgroups:
            processedToolgroups.length > 0 ? processedToolgroups : undefined,
        };
        console.log("Agent config being sent:", agentConfig);

        const response = await client.agents.create({
          agent_config: agentConfig,
        });

        // refresh agents list
        const agentList = await client.agents.list();
        setAgents(
          (agentList.data as Array<{
            agent_id: string;
            agent_config?: {
              agent_name?: string;
              name?: string;
              instructions?: string;
            };
            [key: string]: unknown;
          }>) || []
        );

        // set the new agent as selected
        setSelectedAgentId(response.agent_id);
        await loadAgentConfig(response.agent_id);
        await loadAgentSessions(response.agent_id);

        return response.agent_id;
      } catch (error) {
        console.error("Error creating agent:", error);
        throw error;
      }
    },
    [client, loadAgentSessions, loadAgentConfig]
  );

  const handleVectorDBCreated = useCallback(
    async (vectorDbId: string) => {
      console.log("Vector DB created:", vectorDbId);
      setShowCreateVectorDB(false);

      // Refresh the vector DBs list
      try {
        const vectorDBs = await client.vectorDBs.list();
        const vectorDBsArray = Array.isArray(vectorDBs) ? vectorDBs : [];

        if (vectorDBsArray && Array.isArray(vectorDBsArray)) {
          setAvailableVectorDBs(vectorDBsArray);
          console.log("Refreshed vector DBs:", vectorDBsArray);
        }
      } catch (error) {
        console.error("Error refreshing vector DBs:", error);
      }
    },
    [client]
  );

  const deleteAgent = useCallback(
    async (agentId: string) => {
      if (agents.length <= 1) {
        return;
      }

      if (
        confirm(
          "Are you sure you want to delete this agent? This action cannot be undone and will delete all associated sessions."
        )
      ) {
        try {
          await client.agents.delete(agentId);

          // clear cached data for agent
          SessionUtils.clearAgentCache(agentId);

          // Refresh agents list
          const agentList = await client.agents.list();
          setAgents(
            (agentList.data as Array<{
              agent_id: string;
              agent_config?: {
                agent_name?: string;
                name?: string;
                instructions?: string;
              };
              [key: string]: unknown;
            }>) || []
          );

          // if we deleted the current agent, switch to another one
          if (selectedAgentId === agentId) {
            const remainingAgents = agentList.data?.filter(
              (a: { [key: string]: unknown }) =>
                (a as { agent_id: string }).agent_id !== agentId
            );
            if (remainingAgents && remainingAgents.length > 0) {
              const newAgent = remainingAgents[0] as {
                agent_id: string;
                agent_config?: {
                  agent_name?: string;
                  name?: string;
                  instructions?: string;
                };
                [key: string]: unknown;
              };
              setSelectedAgentId(newAgent.agent_id);
              SessionUtils.saveCurrentAgentId(newAgent.agent_id);
              await loadAgentConfig(newAgent.agent_id);
              await loadAgentSessions(newAgent.agent_id);
            } else {
              // No agents left
              setSelectedAgentId("");
              setCurrentSession(null);
              setSelectedAgentConfig(null);
            }
          }
        } catch (error) {
          console.error("Error deleting agent:", error);
        }
      }
    },
    [agents.length, client, selectedAgentId, loadAgentConfig, loadAgentSessions]
  );

  const handleModelChange = useCallback((newModel: string) => {
    setSelectedModel(newModel);
    setCurrentSession(prev =>
      prev
        ? {
            ...prev,
            selectedModel: newModel,
            updatedAt: Date.now(),
          }
        : prev
    );
  }, []);

  useEffect(() => {
    if (currentSession) {
      console.log(
        `💾 Auto-saving session ID for agent ${currentSession.agentId}:`,
        currentSession.id
      );
      SessionUtils.saveCurrentSessionId(
        currentSession.id,
        currentSession.agentId
      );
      // cache session data
      SessionUtils.saveSessionData(currentSession.agentId, currentSession);
      // only update selectedModel if the session has a valid model and it's different from current
      if (
        currentSession.selectedModel &&
        currentSession.selectedModel !== selectedModel
      ) {
        setSelectedModel(currentSession.selectedModel);
      }
    }
  }, [currentSession, selectedModel]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setModelsLoading(true);
        setModelsError(null);
        const modelList = await client.models.list();

        // Store all models (including embedding models for vector DB creation)
        setModels(modelList);

        // Set default LLM model for chat
        const llmModels = modelList.filter(model => model.model_type === "llm");
        if (llmModels.length > 0) {
          handleModelChange(llmModels[0].identifier);
        }
      } catch (err) {
        console.error("Error fetching models:", err);
        setModelsError("Failed to fetch available models");
      } finally {
        setModelsLoading(false);
      }
    };

    fetchModels();
  }, [client, handleModelChange]);

  // load agent sessions after both agents and models are ready
  useEffect(() => {
    if (
      selectedAgentId &&
      !agentsLoading &&
      !modelsLoading &&
      selectedModel &&
      !currentSession
    ) {
      loadAgentSessions(selectedAgentId);
    }
  }, [
    selectedAgentId,
    agentsLoading,
    modelsLoading,
    selectedModel,
    currentSession,
    loadAgentSessions,
  ]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      createdAt: new Date(),
    };

    setCurrentSession(prev => {
      if (!prev) return prev;
      const updatedSession = {
        ...prev,
        messages: [...prev.messages, userMessage],
        updatedAt: Date.now(),
      };
      // Update cache with new message
      SessionUtils.saveSessionData(prev.agentId, updatedSession);
      return updatedSession;
    });
    setInput("");

    await handleSubmitWithContent(userMessage.content);
  };

  const handleSubmitWithContent = async (content: string) => {
    if (!currentSession || !selectedAgentId) return;

    setIsGenerating(true);
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const userMessage = {
        role: "user" as const,
        content,
      };

      const turnParams: TurnCreateParams = {
        messages: [userMessage],
        stream: true,
      };

      const response = await client.agents.turn.create(
        selectedAgentId,
        currentSession.id,
        turnParams,
        {
          signal: abortController.signal,
          timeout: 300000, // 5 minutes timeout for RAG queries
        } as { signal: AbortSignal; timeout: number }
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        createdAt: new Date(),
      };

      const processChunk = (
        chunk: unknown
      ): { text: string | null; isToolCall: boolean } => {
        const chunkObj = chunk as Record<string, unknown>;

        // Check if this chunk contains a tool call (function call)
        const isToolCall =
          (chunkObj?.delta &&
            typeof chunkObj.delta === "object" &&
            chunkObj.delta !== null &&
            "tool_calls" in (chunkObj.delta as Record<string, unknown>)) ||
          (typeof chunk === "string" &&
            (chunk.includes('"type": "function"') ||
              chunk.includes('"name":') ||
              chunk.includes('"parameters":')));

        // If it's a tool call, skip it (don't display in chat)
        if (isToolCall) {
          console.debug("Tool call detected, skipping display:", chunk);
          return { text: null, isToolCall: true };
        }

        // Extract text content from various chunk formats
        let text: string | null = null;

        if (
          chunkObj?.delta &&
          typeof chunkObj.delta === "object" &&
          chunkObj.delta !== null
        ) {
          const delta = chunkObj.delta as Record<string, unknown>;
          if (typeof delta.text === "string") {
            text = delta.text;
          }
        }

        if (
          !text &&
          chunkObj?.event &&
          typeof chunkObj.event === "object" &&
          chunkObj.event !== null
        ) {
          const event = chunkObj.event as Record<string, unknown>;
          if (
            event?.delta &&
            typeof event.delta === "object" &&
            event.delta !== null
          ) {
            const delta = event.delta as Record<string, unknown>;
            if (typeof delta.text === "string") {
              text = delta.text;
            }
          }
        }

        if (
          !text &&
          chunkObj?.choices &&
          Array.isArray(chunkObj.choices) &&
          chunkObj.choices.length > 0
        ) {
          const choice = chunkObj.choices[0] as Record<string, unknown>;
          if (
            choice?.delta &&
            typeof choice.delta === "object" &&
            choice.delta !== null
          ) {
            const delta = choice.delta as Record<string, unknown>;
            if (typeof delta.content === "string") {
              text = delta.content;
            }
          }
        }

        if (!text && typeof chunk === "string") {
          // Skip if it looks like a tool call JSON
          if (
            chunk.includes('"type": "function"') ||
            chunk.includes('"name":') ||
            chunk.includes('"parameters":')
          ) {
            console.debug("Tool call string detected, skipping:", chunk);
            return { text: null, isToolCall: true };
          }
          text = chunk;
        }

        if (
          !text &&
          chunkObj?.event &&
          typeof chunkObj.event === "object" &&
          chunkObj.event !== null
        ) {
          const event = chunkObj.event as Record<string, unknown>;
          if (
            event?.payload &&
            typeof event.payload === "object" &&
            event.payload !== null
          ) {
            const payload = event.payload as Record<string, unknown>;
            if (
              payload?.delta &&
              typeof payload.delta === "object" &&
              payload.delta !== null
            ) {
              const delta = payload.delta as Record<string, unknown>;
              if (typeof delta.text === "string") {
                text = delta.text;
              }
            }
          }
        }

        if (!text && process.env.NODE_ENV !== "production") {
          console.debug("Unrecognized chunk format:", chunk);
        }

        return { text, isToolCall: false };
      };
      setCurrentSession(prev => {
        if (!prev) return null;
        const updatedSession = {
          ...prev,
          messages: [...prev.messages, assistantMessage],
          updatedAt: Date.now(),
        };
        // update cache with assistant message
        SessionUtils.saveSessionData(prev.agentId, updatedSession);
        return updatedSession;
      });

      let fullContent = "";
      for await (const chunk of response) {
        const { text: deltaText, isToolCall } = processChunk(chunk);

        if (deltaText) {
          fullContent += deltaText;

          flushSync(() => {
            setCurrentSession(prev => {
              if (!prev) return null;
              const newMessages = [...prev.messages];
              const last = newMessages[newMessages.length - 1];
              if (last.role === "assistant") {
                last.content = fullContent;
              }
              const updatedSession = {
                ...prev,
                messages: newMessages,
                updatedAt: Date.now(),
              };
              // update cache with streaming content (throttled)
              if (fullContent.length % 100 === 0) {
                // Only cache every 100 characters to avoid spam
                SessionUtils.saveSessionData(prev.agentId, updatedSession);
              }
              return updatedSession;
            });
          });
        } else if (isToolCall) {
          // Tool call detected - log for debugging but don't display
          console.debug("Tool call processed, continuing stream...");
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Request aborted");
        return;
      }

      console.error("Error sending message:", err);
      setError("Failed to send message. Please try again.");
      setCurrentSession(prev =>
        prev
          ? {
              ...prev,
              messages: prev.messages.slice(0, -1),
              updatedAt: Date.now(),
            }
          : prev
      );
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
      // cache final session state after streaming completes
      setCurrentSession(prev => {
        if (prev) {
          SessionUtils.saveSessionData(prev.agentId, prev);
        }
        return prev;
      });
    }
  };
  const suggestions = [
    "Write a Python function that prints 'Hello, World!'",
    "Explain step-by-step how to solve this math problem: If x² + 6x + 9 = 25, what is x?",
    "Design a simple algorithm to find the longest palindrome in a string.",
  ];

  const append = (message: { role: "user"; content: string }) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: message.role,
      content: message.content,
      createdAt: new Date(),
    };
    setCurrentSession(prev =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, newMessage],
            updatedAt: Date.now(),
          }
        : prev
    );
    handleSubmitWithContent(newMessage.content);
  };

  const clearChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
    }

    setCurrentSession(prev =>
      prev ? { ...prev, messages: [], updatedAt: Date.now() } : prev
    );
    setError(null);
  };

  const handleRAGFileUpload = async (file: File) => {
    if (!selectedAgentConfig?.toolgroups || !selectedAgentId) {
      setError("No agent selected or agent has no RAG tools configured");
      return;
    }

    // Find RAG toolgroups that have vector_db_ids configured
    const ragToolgroups = selectedAgentConfig.toolgroups.filter(toolgroup => {
      if (typeof toolgroup === "object" && toolgroup.name?.includes("rag")) {
        return toolgroup.args && "vector_db_ids" in toolgroup.args;
      }
      return false;
    });

    if (ragToolgroups.length === 0) {
      setError("Current agent has no vector databases configured for RAG");
      return;
    }

    try {
      setError(null);
      console.log("Uploading file using RAG tool...");

      // Show loading notification
      setUploadNotification({
        show: true,
        message: `📄 Uploading and indexing "${file.name}"...`,
        type: "loading",
      });

      // Get all vector DB IDs from RAG toolgroups
      const vectorDbIds = ragToolgroups.flatMap(toolgroup => {
        if (
          typeof toolgroup === "object" &&
          toolgroup.args &&
          "vector_db_ids" in toolgroup.args
        ) {
          return toolgroup.args.vector_db_ids as string[];
        }
        return [];
      });

      // Determine mime type from file extension
      const getContentType = (filename: string): string => {
        const ext = filename.toLowerCase().split(".").pop();
        switch (ext) {
          case "pdf":
            return "application/pdf";
          case "txt":
            return "text/plain";
          case "md":
            return "text/markdown";
          case "html":
            return "text/html";
          case "csv":
            return "text/csv";
          case "json":
            return "application/json";
          case "docx":
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          case "doc":
            return "application/msword";
          default:
            return "application/octet-stream";
        }
      };

      const mimeType = getContentType(file.name);
      let fileContent: string;

      // Handle text files vs binary files differently
      const isTextFile =
        mimeType.startsWith("text/") ||
        mimeType === "application/json" ||
        mimeType === "text/markdown" ||
        mimeType === "text/html" ||
        mimeType === "text/csv";

      if (isTextFile) {
        // Read text files as text
        fileContent = await file.text();
      } else {
        // Read binary files (PDF, Word docs, etc.) as base64
        const arrayBuffer = await file.arrayBuffer();
        fileContent = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      }

      // Insert into each vector database
      for (const vectorDbId of vectorDbIds) {
        await client.toolRuntime.ragTool.insert({
          documents: [
            {
              content: fileContent, // Pass file content (text or base64)
              document_id: `${file.name}-${Date.now()}`,
              metadata: {
                filename: file.name,
                file_size: file.size,
                uploaded_at: new Date().toISOString(),
                agent_id: selectedAgentId,
              },
              mime_type: mimeType, // Use the determined mime type
            },
          ],
          vector_db_id: vectorDbId,
          chunk_size_in_tokens: 512,
        });
      }

      console.log("✅ File successfully uploaded using RAG tool");

      // Show success notification
      setUploadNotification({
        show: true,
        message: `📄 File "${file.name}" uploaded and indexed successfully!`,
        type: "success",
      });

      // Auto-hide notification after 4 seconds
      setTimeout(() => {
        setUploadNotification(prev => ({ ...prev, show: false }));
      }, 4000);
    } catch (err) {
      console.error("Error uploading file using RAG tool:", err);
      const errorMessage =
        err instanceof Error
          ? `Failed to upload file: ${err.message}`
          : "Failed to upload file using RAG tool";

      // Show error notification
      setUploadNotification({
        show: true,
        message: errorMessage,
        type: "error",
      });

      // Auto-hide notification after 6 seconds for errors
      setTimeout(() => {
        setUploadNotification(prev => ({ ...prev, show: false }));
      }, 6000);
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-7xl mx-auto">
      {/* Upload Notification */}
      {uploadNotification.show && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all duration-300 ${
            uploadNotification.type === "success"
              ? "bg-green-100 border border-green-300 text-green-800"
              : uploadNotification.type === "error"
                ? "bg-red-100 border border-red-300 text-red-800"
                : "bg-blue-100 border border-blue-300 text-blue-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {uploadNotification.type === "loading" && (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
            )}
            <span className="text-sm font-medium">
              {uploadNotification.message}
            </span>
            {uploadNotification.type !== "loading" && (
              <button
                onClick={() =>
                  setUploadNotification(prev => ({ ...prev, show: false }))
                }
                className="ml-2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Agent Session</h1>
          <div className="flex items-center gap-3">
            {!agentsLoading && agents.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Agent Session:</label>
                <Select
                  value={selectedAgentId}
                  onValueChange={agentId => {
                    console.log("🤖 User selected agent:", agentId);
                    setSelectedAgentId(agentId);
                    SessionUtils.saveCurrentAgentId(agentId);
                    loadAgentConfig(agentId);
                    loadAgentSessions(agentId);
                  }}
                  disabled={agentsLoading}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue
                      placeholder={
                        agentsLoading ? "Loading..." : "Select Agent Session"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map(agent => (
                      <SelectItem key={agent.agent_id} value={agent.agent_id}>
                        {(() => {
                          if (
                            agent.agent_config &&
                            "name" in agent.agent_config &&
                            typeof agent.agent_config.name === "string"
                          ) {
                            return agent.agent_config.name;
                          }
                          if (
                            agent.agent_config &&
                            "agent_name" in agent.agent_config &&
                            typeof agent.agent_config.agent_name === "string"
                          ) {
                            return agent.agent_config.agent_name;
                          }
                          return `Agent ${agent.agent_id.slice(0, 8)}...`;
                        })()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedAgentId && agents.length > 1 && (
                  <Button
                    onClick={() => deleteAgent(selectedAgentId)}
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Delete current agent"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
            <Button
              onClick={() => setShowCreateAgent(true)}
              variant="outline"
              size="sm"
            >
              + New Agent
            </Button>
            {!agentsLoading && agents.length > 0 && (
              <Button
                variant="outline"
                onClick={clearChat}
                disabled={isGenerating}
              >
                Clear Chat
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* Main Two-Column Layout */}
      <div className="flex flex-1 gap-6 min-h-0 flex-col lg:flex-row">
        {/* Left Column - Configuration Panel */}
        <div className="w-full lg:w-80 lg:flex-shrink-0 space-y-6 p-4 border border-border rounded-lg bg-muted/30">
          <h2 className="text-lg font-semibold border-b pb-2 text-left">
            Settings
          </h2>

          {/* Model Configuration */}
          <div className="space-y-4 text-left">
            <h3 className="text-lg font-semibold border-b pb-2 text-left">
              Model Configuration
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-2">Model</label>
                <Select
                  value={selectedModel}
                  onValueChange={handleModelChange}
                  disabled={isModelsLoading || isGenerating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        isModelsLoading ? "Loading..." : "Select Model"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {models
                      .filter(model => model.model_type === "llm")
                      .map(model => (
                        <SelectItem
                          key={model.identifier}
                          value={model.identifier}
                        >
                          {model.identifier}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {modelsError && (
                  <p className="text-destructive text-xs mt-1">{modelsError}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Agent Instructions
                </label>
                <div className="w-full h-24 px-3 py-2 text-sm border border-input rounded-md bg-muted text-muted-foreground">
                  {(selectedAgentId &&
                    agents.find(a => a.agent_id === selectedAgentId)
                      ?.agent_config?.instructions) ||
                    "No agent selected"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Instructions are set when creating an agent and cannot be
                  changed.
                </p>
              </div>
            </div>
          </div>

          {/* Agent Tools */}
          <div className="space-y-4 text-left">
            <h3 className="text-lg font-semibold border-b pb-2 text-left">
              Agent Tools
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-2 text-muted-foreground">
                  Configured Tools (Coming Soon)
                </label>
                <div className="space-y-2">
                  {selectedAgentConfig?.toolgroups &&
                  selectedAgentConfig.toolgroups.length > 0 ? (
                    selectedAgentConfig.toolgroups.map(
                      (
                        toolgroup:
                          | string
                          | { name: string; args: Record<string, unknown> },
                        index: number
                      ) => {
                        const toolName =
                          typeof toolgroup === "string"
                            ? toolgroup
                            : toolgroup.name;
                        const toolArgs =
                          typeof toolgroup === "object" ? toolgroup.args : null;

                        // Format RAG tools nicely
                        const isRAGTool = toolName.includes("rag");
                        const displayName = isRAGTool ? "RAG Search" : toolName;
                        const displayIcon = isRAGTool
                          ? "🔍"
                          : toolName.includes("search")
                            ? "🌐"
                            : "🔧";

                        return (
                          <div
                            key={index}
                            className="p-3 border border-input rounded-md bg-muted text-muted-foreground"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{displayIcon}</span>
                                <span className="text-sm font-medium text-primary">
                                  {displayName}
                                </span>
                              </div>
                            </div>
                            {isRAGTool &&
                              toolArgs &&
                              toolArgs.vector_db_ids && (
                                <div className="mt-2 text-xs text-muted-foreground">
                                  <span className="font-medium">
                                    Vector Databases:
                                  </span>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {Array.isArray(toolArgs.vector_db_ids) ? (
                                      toolArgs.vector_db_ids.map(
                                        (dbId: string, idx: number) => (
                                          <code
                                            key={idx}
                                            className="px-1.5 py-0.5 bg-muted-foreground/10 rounded text-xs"
                                          >
                                            {dbId}
                                          </code>
                                        )
                                      )
                                    ) : (
                                      <code className="px-1.5 py-0.5 bg-muted-foreground/10 rounded text-xs">
                                        {toolArgs.vector_db_ids}
                                      </code>
                                    )}
                                  </div>
                                </div>
                              )}
                            {!isRAGTool &&
                              toolArgs &&
                              Object.keys(toolArgs).length > 0 && (
                                <div className="mt-2 text-xs text-muted-foreground">
                                  <span className="font-medium">
                                    Configuration:
                                  </span>{" "}
                                  {Object.keys(toolArgs).length} parameter
                                  {Object.keys(toolArgs).length > 1 ? "s" : ""}
                                </div>
                              )}
                          </div>
                        );
                      }
                    )
                  ) : (
                    <div className="p-3 border border-input rounded-md bg-muted text-center">
                      <p className="text-sm text-muted-foreground">
                        No tools configured
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        This agent only has text generation capabilities
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Tools are configured when creating an agent and provide
                  additional capabilities like web search, math calculations, or
                  RAG document retrieval.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Chat Interface */}
        <div className="flex-1 flex flex-col min-h-0 p-4 border border-border rounded-lg bg-background">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          <Chat
            className="flex-1"
            messages={currentSession?.messages || []}
            handleSubmit={handleSubmit}
            input={input}
            handleInputChange={handleInputChange}
            isGenerating={isGenerating}
            append={append}
            suggestions={suggestions}
            setMessages={messages =>
              setCurrentSession(prev =>
                prev ? { ...prev, messages, updatedAt: Date.now() } : prev
              )
            }
            onRAGFileUpload={handleRAGFileUpload}
          />
        </div>
      </div>

      {/* Create Agent Modal */}
      {showCreateAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-[500px] p-6 space-y-4">
            <h3 className="text-lg font-semibold">Create New Agent</h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">
                  Agent Name (optional)
                </label>
                <Input
                  value={newAgentName}
                  onChange={e => setNewAgentName(e.target.value)}
                  placeholder="My Custom Agent"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Model</label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models
                      .filter(model => model.model_type === "llm")
                      .map(model => (
                        <SelectItem
                          key={model.identifier}
                          value={model.identifier}
                        >
                          {model.identifier}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  System Instructions
                </label>
                <textarea
                  value={newAgentInstructions}
                  onChange={e => setNewAgentInstructions(e.target.value)}
                  placeholder="You are a helpful assistant."
                  className="w-full h-32 px-3 py-2 text-sm border border-input rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Tools (optional)
                </label>
                <label className="text-sm font-small block mb-2">
                  NOTE: Tools are not yet implemented
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Available toolgroups: {availableToolgroups.length} found
                </p>
                <div className="space-y-2">
                  {availableToolgroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Loading toolgroups...
                    </p>
                  ) : (
                    availableToolgroups.map(toolgroup => (
                      <label
                        key={toolgroup.identifier}
                        className="flex items-center space-x-2"
                      >
                        <input
                          type="checkbox"
                          checked={selectedToolgroups.includes(
                            toolgroup.identifier
                          )}
                          onChange={e => {
                            console.log(
                              "Tool selection changed:",
                              toolgroup.identifier,
                              e.target.checked
                            );
                            if (e.target.checked) {
                              setSelectedToolgroups(prev => {
                                const newSelection = [
                                  ...prev,
                                  toolgroup.identifier,
                                ];
                                console.log(
                                  "New selected toolgroups:",
                                  newSelection
                                );
                                return newSelection;
                              });
                            } else {
                              setSelectedToolgroups(prev => {
                                const newSelection = prev.filter(
                                  id => id !== toolgroup.identifier
                                );
                                console.log(
                                  "New selected toolgroups:",
                                  newSelection
                                );
                                return newSelection;
                              });
                            }
                          }}
                          className="rounded border-input"
                        />
                        <span className="text-sm">
                          <code className="bg-muted px-1 rounded text-xs">
                            {toolgroup.identifier}
                          </code>
                          <span className="text-muted-foreground ml-2">
                            ({toolgroup.provider_id})
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {selectedToolgroups.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No tools selected - agent will only have text generation
                    capabilities.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 border border-border rounded">
                  <strong>Note:</strong> Selected tools will be configured for
                  the agent. Some tools like RAG may require additional vector
                  DB configuration, and web search tools need API keys. Basic
                  text generation agents work without tools.
                </p>
              </div>

              {/* Vector DB Configuration for RAG */}
              {selectedToolgroups.includes("builtin::rag") && (
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Vector Databases for RAG
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCreateVectorDB(true)}
                    >
                      + Create Vector DB
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {availableVectorDBs.length} available
                    </span>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {availableVectorDBs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No vector databases available. Create one to use RAG
                        tools.
                      </p>
                    ) : (
                      availableVectorDBs.map(vectorDB => (
                        <label
                          key={vectorDB.identifier}
                          className="flex items-center space-x-2"
                        >
                          <input
                            type="checkbox"
                            checked={selectedVectorDBs.includes(
                              vectorDB.identifier
                            )}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedVectorDBs(prev => [
                                  ...prev,
                                  vectorDB.identifier,
                                ]);
                              } else {
                                setSelectedVectorDBs(prev =>
                                  prev.filter(id => id !== vectorDB.identifier)
                                );
                              }
                            }}
                            className="rounded border-input"
                          />
                          <span className="text-sm">
                            <code className="bg-muted px-1 rounded text-xs">
                              {vectorDB.identifier}
                            </code>
                            {vectorDB.vector_db_name && (
                              <span className="text-muted-foreground ml-2">
                                ({vectorDB.vector_db_name})
                              </span>
                            )}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  {selectedVectorDBs.length === 0 &&
                    selectedToolgroups.includes("builtin::rag") && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ⚠️ RAG tool selected but no vector databases chosen.
                        Create or select a vector database.
                      </p>
                    )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={async () => {
                  try {
                    await createNewAgent(
                      newAgentName,
                      newAgentInstructions,
                      selectedModel,
                      selectedToolgroups,
                      selectedVectorDBs
                    );
                    setShowCreateAgent(false);
                    setNewAgentName("");
                    setNewAgentInstructions("You are a helpful assistant.");
                    setSelectedToolgroups([]);
                    setSelectedVectorDBs([]);
                  } catch (error) {
                    console.error("Failed to create agent:", error);
                  }
                }}
                className="flex-1"
                disabled={!selectedModel || !newAgentInstructions.trim()}
              >
                Create Agent
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateAgent(false);
                  setNewAgentName("");
                  setNewAgentInstructions("You are a helpful assistant.");
                  setSelectedToolgroups([]);
                  setSelectedVectorDBs([]);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Create Vector DB Modal */}
      {showCreateVectorDB && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <VectorDBCreator
            models={models}
            onVectorDBCreated={handleVectorDBCreated}
            onCancel={() => setShowCreateVectorDB(false)}
          />
        </div>
      )}
    </div>
  );
}
