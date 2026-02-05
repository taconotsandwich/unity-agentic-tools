/**
 * Metadata for stored document chunks
 */
export interface ChunkMetadata {
  source: string;
  type?: string;
  language?: string;
  page?: number;
  file_path?: string;
  section?: string;
  unity_class?: string;
  unity_method?: string;
}

/**
 * Type alias for embedding vectors
 */
export type EmbeddingVector = number[];

/**
 * OpenAI embedding API response structure
 */
export interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
    object: string;
  }>;
  model: string;
  object: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}
