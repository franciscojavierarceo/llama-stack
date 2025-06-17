# Search vector store

Search a vector store for relevant chunks based on a query and file attributes filter.

```{admonition} Endpoint
:class: note
**POST** `https://api.openai.com/v1/vector_stores/{vector_store_id}/search`
```

## Path parameters

```{list-table}
:header-rows: 1
:widths: 20 10 70

* - Parameter
  - Type
  - Description
* - **vector_store_id**
  - string
  - **Required**. The ID of the vector store to search.
```

## Request body

```{list-table}
:header-rows: 1
:widths: 20 10 10 60

* - Parameter
  - Type
  - Required
  - Description
* - **query**
  - string or array
  - **Required**
  - The query string or array for performing the search.
* - **filters**
  - object
  - Optional
  - Filters based on file attributes to narrow the search results.
* - **max_num_results**
  - integer
  - Optional
  - Maximum number of results to return (1 to 50 inclusive, default 10).
* - **ranking_options**
  - object
  - Optional
  - Ranking options for fine-tuning the search results.
* - **rewrite_query**
  - boolean
  - Optional
  - Whether to rewrite the natural language query for vector search (default false).
```

````{dropdown} Show possible values
:open:

**filters**

A filter to apply to the search results. The filter should be a JSON object where keys are file attribute names and values are the expected values for those attributes.

**ranking_options**

Options for customizing the ranking of search results. This can include parameters for adjusting relevance scoring.

**rewrite_query**

When set to `true`, the system will attempt to rewrite the natural language query to optimize it for vector search.
````

## Example request

```{code-block} bash
:caption: curl
curl -X POST \
  https://api.openai.com/v1/vector_stores/vs_abc123/search \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the return policy?",
    "filters": {
      "source": "help_center"
    },
    "max_num_results": 5
  }'
```

## Response

Returns a `VectorStoreSearchResponsePage` object containing the search results.

```{code-block} json
:caption: Example response
{
  "object": "vector_store.search_results.page",
  "search_query": "What is the return policy?",
  "data": [
    {
      "file_id": "file_123",
      "filename": "document.pdf",
      "score": 0.95,
      "attributes": {
        "author": "John Doe",
        "date": "2023-01-01"
      },
      "content": [
        {
          "type": "text",
          "text": "Relevant chunk content from the vector store"
        }
      ]
    },
    {
      "file_id": "file_456",
      "filename": "notes.txt",
      "score": 0.80,
      "attributes": {
        "author": "Jane Smith",
        "date": "2023-01-02"
      },
      "content": [
        {
          "type": "text",
          "text": "Sample text content from the vector store"
        }
      ]
    }
  ],
  "has_more": false,
  "next_page": null
}
```

## Returns

A page of search results from the vector store.

```{list-table}
:header-rows: 1
:widths: 20 10 70

* - Field
  - Type
  - Description
* - **object**
  - string
  - Always `vector_store.search_results.page`
* - **search_query**
  - string
  - The query that was used for the search
* - **data**
  - array
  - Array of search result objects
* - **has_more**
  - boolean
  - Whether there are more results available
* - **next_page**
  - string
  - Token for retrieving the next page of results
```

### Search result object

```{list-table}
:header-rows: 1
:widths: 20 10 70

* - Field
  - Type
  - Description
* - **file_id**
  - string
  - The ID of the file containing this chunk
* - **filename**
  - string
  - The name of the file containing this chunk
* - **score**
  - number
  - The relevance score for this result
* - **attributes**
  - object
  - Key-value attributes stored with the file
* - **content**
  - array
  - Array of content objects containing the matching text
```

## Related endpoints

```{toctree}
:maxdepth: 1

../../../openai/index
```
