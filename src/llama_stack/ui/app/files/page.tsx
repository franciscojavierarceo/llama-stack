"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Upload, 
  Search, 
  FileText, 
  Image, 
  File, 
  Download,
  Trash2,
  Eye,
  Calendar,
  HardDrive,
  Plus,
  Check,
  MoreHorizontal
} from "lucide-react";

// Mock data for when backend is not running
const mockFiles = [
  {
    id: "file_7a8b9c2d1e3f",
    name: "document.pdf",
    type: "pdf",
    size: "2.3 MB",
    uploadedAt: "2024-01-15T10:30:00Z",
    status: "processed",
    vectorStoreId: "vs_7a8b9c2d1e3f4g",
    chunks: 45
  },
  {
    id: "file_4x5y6z7a8b9c", 
    name: "presentation.pptx",
    type: "presentation",
    size: "5.7 MB",
    uploadedAt: "2024-01-14T14:20:00Z",
    status: "processing",
    vectorStoreId: "vs_7a8b9c2d1e3f4g",
    chunks: 0
  },
  {
    id: "file_1m2n3p4q5r6s",
    name: "data.csv",
    type: "spreadsheet", 
    size: "1.2 MB",
    uploadedAt: "2024-01-13T09:15:00Z",
    status: "processed",
    vectorStoreId: "vs_4x5y6z7a8b9c1d",
    chunks: 23
  },
  {
    id: "file_9t8u7v6w5x4y",
    name: "image.jpg",
    type: "image",
    size: "3.1 MB", 
    uploadedAt: "2024-01-12T16:45:00Z",
    status: "processed",
    vectorStoreId: "vs_7a8b9c2d1e3f4g",
    chunks: 12
  },
  {
    id: "file_3z2a1b4c5d6e",
    name: "report.docx",
    type: "document",
    size: "4.8 MB",
    uploadedAt: "2024-01-11T11:30:00Z", 
    status: "error",
    vectorStoreId: null,
    chunks: 0
  }
];

// Mock vector stores for the modal
const mockVectorStores = [
  { id: "vs_7a8b9c2d1e3f4g", name: "Document Store", fileCount: 15 },
  { id: "vs_4x5y6z7a8b9c1d", name: "Research Papers", fileCount: 8 },
  { id: "vs_1m2n3p4q5r6s7t", name: "Legal Documents", fileCount: 3 },
  { id: "vs_9t8u7v6w5x4y3z", name: "Technical Docs", fileCount: 12 }
];

const getFileIcon = (type: string) => {
  switch (type) {
    case "pdf":
    case "document":
      return <FileText className="h-5 w-5 text-red-500" />;
    case "image":
      return <Image className="h-5 w-5 text-green-500" />;
    case "presentation":
      return <File className="h-5 w-5 text-orange-500" />;
    case "spreadsheet":
      return <File className="h-5 w-5 text-green-600" />;
    default:
      return <File className="h-5 w-5 text-gray-500" />;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "processed":
      return <Badge variant="default" className="bg-green-100 text-green-800">Processed</Badge>;
    case "processing":
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Processing</Badge>;
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
};

export default function FilesPage() {
  const [files, setFiles] = useState(mockFiles);
  const [searchTerm, setSearchTerm] = useState("");
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isVectorStoreModalOpen, setIsVectorStoreModalOpen] = useState(false);
  const [selectedVectorStore, setSelectedVectorStore] = useState<string>("");

  // Check if backend is connected
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('/api/v1/health');
        setIsBackendConnected(response.ok);
      } catch (error) {
        setIsBackendConnected(false);
      }
    };
    checkBackend();
  }, []);

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUpload = () => {
    // Placeholder for file upload functionality
    alert("File upload functionality would be implemented here when backend is connected");
  };

  const handleViewFile = (fileId: string) => {
    // Placeholder for viewing file details
    alert(`View file ${fileId} - would show file details and chunks`);
  };

  const handleDeleteFile = (fileId: string) => {
    setFiles(files.filter(file => file.id !== fileId));
  };

  const handleAddSingleFileToVectorStore = (fileId: string) => {
    setSelectedFiles(new Set([fileId]));
    setIsVectorStoreModalOpen(true);
  };

  const handleSelectFile = (fileId: string, checked: boolean) => {
    const newSelected = new Set(selectedFiles);
    if (checked) {
      newSelected.add(fileId);
    } else {
      newSelected.delete(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedFiles(new Set(filteredFiles.map(file => file.id)));
    } else {
      setSelectedFiles(new Set());
    }
  };

  const handleAddToVectorStore = () => {
    if (selectedFiles.size === 0) {
      alert("Please select at least one file");
      return;
    }
    setIsVectorStoreModalOpen(true);
  };

  const handleConfirmAddToVectorStore = () => {
    if (!selectedVectorStore) {
      alert("Please select a vector store");
      return;
    }
    
    // Update files with new vector store
    setFiles(files.map(file => 
      selectedFiles.has(file.id) 
        ? { ...file, vectorStoreId: selectedVectorStore, status: "processing" as const }
        : file
    ));
    
    // Reset selections and close modal
    setSelectedFiles(new Set());
    setSelectedVectorStore("");
    setIsVectorStoreModalOpen(false);
    
    alert(`Added ${selectedFiles.size} file(s) to vector store`);
  };

  const handleDeleteSelected = () => {
    if (selectedFiles.size === 0) {
      alert("Please select at least one file");
      return;
    }
    
    if (confirm(`Are you sure you want to delete ${selectedFiles.size} file(s)?`)) {
      setFiles(files.filter(file => !selectedFiles.has(file.id)));
      setSelectedFiles(new Set());
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Files</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your uploaded files and documents
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedFiles.size > 0 && (
            <>
              <Button 
                variant="outline" 
                onClick={handleAddToVectorStore}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add to Vector Store ({selectedFiles.size})
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteSelected}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selectedFiles.size})
              </Button>
            </>
          )}
          <Button onClick={handleUpload} className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Files
          </Button>
        </div>
      </div>

      {/* Backend Status */}
      {!isBackendConnected && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
              <HardDrive className="h-5 w-5" />
              <span className="font-medium">Demo Mode</span>
            </div>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              Backend server is not running. Showing placeholder data. 
              Connect to a Llama Stack server to manage real files.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {filteredFiles.length} files
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Files Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedFiles.size === filteredFiles.length && filteredFiles.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead className="w-[120px]">File Size</TableHead>
                  <TableHead className="w-[150px]">Created</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFiles.map((file) => (
                  <TableRow key={file.id} className="hover:bg-muted/50">
                    <TableCell>
                      <Checkbox
                        checked={selectedFiles.has(file.id)}
                        onCheckedChange={(checked) => handleSelectFile(file.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {file.id}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFileIcon(file.type)}
                        <span className="font-medium">{file.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                      {file.size}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(file.uploadedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(file.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewFile(file.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleAddSingleFileToVectorStore(file.id)}>
                              <Plus className="h-4 w-4 mr-2" />
                              Add to Vector Store
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteFile(file.id)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete File
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
      {filteredFiles.length === 0 && (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No files found
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {searchTerm ? "Try adjusting your search terms" : "Upload your first file to get started"}
            </p>
            <Button onClick={handleUpload}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Vector Store Selection Modal */}
      <Dialog open={isVectorStoreModalOpen} onOpenChange={setIsVectorStoreModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Files to Vector Store</DialogTitle>
            <DialogDescription>
              Select a vector store to add {selectedFiles.size} selected file(s) to.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Vector Store</label>
              <Select value={selectedVectorStore} onValueChange={setSelectedVectorStore}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a vector store" />
                </SelectTrigger>
                <SelectContent>
                  {mockVectorStores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{store.name}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          ({store.fileCount} files)
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>Selected files:</p>
              <ul className="list-disc list-inside mt-1">
                {Array.from(selectedFiles).map(fileId => {
                  const file = files.find(f => f.id === fileId);
                  return file ? (
                    <li key={fileId} className="text-xs">{file.name}</li>
                  ) : null;
                })}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsVectorStoreModalOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmAddToVectorStore}
              disabled={!selectedVectorStore}
            >
              <Check className="h-4 w-4 mr-2" />
              Add to Vector Store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
