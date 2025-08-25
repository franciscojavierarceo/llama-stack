"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthClient } from "@/hooks/use-auth-client";
import { Upload, FileText, Trash2 } from "lucide-react";

interface VectorDBFileManagerProps {
  availableVectorDBs: Array<{
    identifier: string;
    vector_db_name?: string;
    embedding_model: string;
  }>;
  onClose?: () => void;
}

interface UploadedDocument {
  document_id: string;
  filename: string;
  mime_type: string;
  size: number;
  uploadedAt: Date;
  vector_db_id: string;
}

export function VectorDBFileManager({
  availableVectorDBs,
  onClose,
}: VectorDBFileManagerProps) {
  const [selectedVectorDB, setSelectedVectorDB] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [chunkSize, setChunkSize] = useState(512);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<
    UploadedDocument[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const client = useAuthClient();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedVectorDB) {
      setError("Please select both a file and a vector database");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      console.log("Uploading file using RAG tool...");

      // Convert file to base64 for RAG tool processing
      const arrayBuffer = await selectedFile.arrayBuffer();
      const base64Content = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

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

      // Use RAG tool to insert document
      await client.toolRuntime.ragTool.insert({
        documents: [
          {
            content: base64Content,
            document_id: `${selectedFile.name}-${Date.now()}`,
            metadata: {
              filename: selectedFile.name,
              file_size: selectedFile.size,
              uploaded_at: new Date().toISOString(),
            },
            mime_type: getContentType(selectedFile.name),
          },
        ],
        vector_db_id: selectedVectorDB,
        chunk_size_in_tokens: chunkSize,
      });

      // Add to uploaded documents list
      const uploadedDoc: UploadedDocument = {
        document_id: `${selectedFile.name}-${Date.now()}`,
        filename: selectedFile.name,
        mime_type: selectedFile.type || "application/octet-stream",
        size: selectedFile.size,
        uploadedAt: new Date(),
        vector_db_id: selectedVectorDB,
      };

      setUploadedDocuments(prev => [...prev, uploadedDoc]);
      setSelectedFile(null);

      // Reset file input
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      console.log(
        "✅ Document uploaded and indexed successfully using RAG tool"
      );
    } catch (err) {
      console.error("Error uploading document:", err);
      setError(
        err instanceof Error ? err.message : "Failed to upload document"
      );
    } finally {
      setIsUploading(false);
    }
  };

  const loadExistingFiles = useCallback(async () => {
    if (!selectedVectorDB) return;

    try {
      console.log("Loading existing files for vector DB:", selectedVectorDB);
      // Note: RAG tool manages documents differently than vector stores
      // For now, we'll start with an empty list since the RAG tool
      // handles document indexing internally
      setUploadedDocuments([]);
      console.log(
        "Vector databases managed by RAG tool - existing files not directly accessible"
      );
    } catch (err) {
      console.error("Error loading existing files:", err);
    }
  }, [selectedVectorDB]);

  // Load existing files when vector DB is selected
  useEffect(() => {
    if (selectedVectorDB) {
      loadExistingFiles();
    } else {
      setUploadedDocuments([]);
    }
  }, [selectedVectorDB, loadExistingFiles]);

  const removeDocument = async (documentId: string) => {
    if (!selectedVectorDB) return;

    try {
      // Note: RAG tool doesn't currently provide a direct delete API
      // For now, we'll just remove from local state
      // In a production system, you'd want to implement document deletion via RAG tool

      // Remove from local state
      setUploadedDocuments(prev =>
        prev.filter(doc => doc.document_id !== documentId)
      );

      console.log("Document removed from UI:", documentId);
      setError(
        "Note: Document removal from vector database not yet implemented via RAG tool"
      );
    } catch (err) {
      console.error("Error removing document:", err);
      setError(
        err instanceof Error ? err.message : "Failed to remove document"
      );
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Vector Database File Manager
          </CardTitle>
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Upload Document</h3>

          <div>
            <label className="text-sm font-medium block mb-2">
              Select Vector Database
            </label>
            <Select
              value={selectedVectorDB}
              onValueChange={setSelectedVectorDB}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a vector database" />
              </SelectTrigger>
              <SelectContent>
                {availableVectorDBs.map(vectorDB => (
                  <SelectItem
                    key={vectorDB.identifier}
                    value={vectorDB.identifier}
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-sm">
                        {vectorDB.identifier}
                      </span>
                      {vectorDB.vector_db_name && (
                        <span className="text-xs text-muted-foreground">
                          {vectorDB.vector_db_name}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">
              Select File
            </label>
            <Input
              type="file"
              onChange={handleFileSelect}
              accept=".pdf,.txt,.md,.html,.csv,.json"
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Supported formats: PDF, TXT, MD, HTML, CSV, JSON
            </p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">
              Chunk Size (tokens)
            </label>
            <Input
              type="number"
              value={chunkSize}
              onChange={e => {
                const value = parseInt(e.target.value) || 512;
                setChunkSize(Math.max(100, Math.min(4096, value))); // Enforce limits
              }}
              min={100}
              max={4096}
              placeholder="512"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximum tokens per chunk for document splitting (100-4096). 10%
              overlap will be automatically added between chunks.
            </p>
          </div>

          {selectedFile && (
            <div className="p-3 bg-muted rounded border">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({formatFileSize(selectedFile.size)})
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="text-destructive text-sm bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}

          {/* Debug info in development */}
          {process.env.NODE_ENV === "development" && (
            <div className="text-xs bg-blue-50 p-2 rounded border">
              <strong>Debug:</strong>
              <br />
              Vector DB: {selectedVectorDB || "none"}
              <br />
              File: {selectedFile?.name || "none"}
              <br />
              Uploading: {isUploading ? "yes" : "no"}
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={isUploading || !selectedFile || !selectedVectorDB}
            className="w-full"
            title={
              !selectedVectorDB
                ? "Please select a vector database first"
                : !selectedFile
                  ? "Please select a file to upload"
                  : isUploading
                    ? "Upload in progress..."
                    : "Ready to upload"
            }
          >
            {isUploading ? "Uploading..." : "Upload to Vector DB"}
          </Button>
        </div>

        {/* Uploaded Documents Section */}
        {uploadedDocuments.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Uploaded Documents</h3>
            <div className="space-y-2">
              {uploadedDocuments.map(doc => (
                <div
                  key={doc.document_id}
                  className="flex items-center justify-between p-3 border rounded"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4" />
                    <div>
                      <div className="text-sm font-medium">{doc.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(doc.size)} •{" "}
                        {doc.uploadedAt.toLocaleString()} • {doc.vector_db_id}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeDocument(doc.document_id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
          <strong>Note:</strong> Files are uploaded to the llama-stack file
          system and then processed into the selected vector database with
          automatic chunking. They can be searched using RAG tools in agent
          conversations. Larger chunk sizes preserve more context but may reduce
          search precision.
        </div>
      </CardContent>
    </Card>
  );
}
