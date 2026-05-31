export type SearchItem = { 
  id: string; 
  title: string; 
  author: string; 
  type: 'track' | 'playlist' | 'local'; 
  source: 'network' | 'local'; 
  query: string; 
}