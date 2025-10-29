"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface FileItem {
  id: string;
  name?: string;
  filename?: string;
  size_bytes?: number;
  created_at?: number;
  [key: string]: unknown;
}

export default function FilesListPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadFiles() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/v1/files", { method: "GET" });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        // Expect either {object: 'list', data: [...]} or array
        const list: FileItem[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
          ? data.data
          : [];
        if (!cancelled) setFiles(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadFiles();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRowClick = (id: string) => {
    router.push(`/files/${id}`);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Files</h1>
        <Button asChild>
          <Link href="/files/upload">Upload Files</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Uploaded Files</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : error ? (
            <div className="text-sm text-destructive">Failed to load files: {error}</div>
          ) : files.length === 0 ? (
            <div className="text-sm text-muted-foreground">No files yet. Upload some to get started.</div>
          ) : (
            <Table>
              <TableCaption>All uploaded files</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map(file => (
                  <TableRow
                    key={file.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => handleRowClick(file.id)}
                  >
                    <TableCell className="font-mono text-xs">{file.id}</TableCell>
                    <TableCell>{file.name || file.filename || "—"}</TableCell>
                    <TableCell>{formatBytes(file.size_bytes)}</TableCell>
                    <TableCell>
                      {file.created_at ? new Date(file.created_at * 1000).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"]; 
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}



