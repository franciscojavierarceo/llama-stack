"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { ChatMessage } from "@/lib/types";
import { ChatMessageItem } from "@/components/chat-completions/chat-messasge-item";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Loader2 } from "lucide-react";

export default function ChatPlaygroundPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const extractTextContent = (content: any): string => {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('');
    }
    if (content && content.type === 'text') {
      return content.text || '';
    }
    return '';
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: inputMessage.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.accessToken && { 'Authorization': `Bearer ${session.accessToken}` }),
        },
        body: JSON.stringify({
          model: "meta-llama/Llama-3.2-3B-Instruct",
          messages: [...messages, userMessage].map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.choices && data.choices.length > 0) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: extractTextContent(data.choices[0].message.content),
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Chat Playground</h1>
        <Button variant="outline" onClick={clearChat} disabled={isLoading}>
          Clear Chat
        </Button>
      </div>

      <Card className="flex-1 flex flex-col">
        <CardHeader>
          <CardTitle>Chat Messages</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto mb-4 space-y-4 min-h-0">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p>Start a conversation by typing a message below.</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <ChatMessageItem key={index} message={message} />
              ))
            )}
            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-muted-foreground">Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message here..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              size="icon"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
