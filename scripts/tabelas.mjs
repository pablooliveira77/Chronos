// Data Tables que os workflows usam. O setup cria as que faltarem; os JSONs apontam por nome
// (placeholder __DATATABLE:<nome>__), nunca por id, para funcionar em qualquer instância.
export const TABELAS = {
  chronos_estado: [
    ['chave', 'string'], ['valor', 'string'], ['ts', 'number'],
  ],
  chronos_pendencias: [
    ['pid', 'string'], ['chat_id', 'string'], ['tipo', 'string'], ['status', 'string'], ['payload', 'string'],
    ['criado_ms', 'number'], ['message_id', 'number'],
  ],
  chronos_uso: [
    ['ts', 'string'], ['tipo', 'string'], ['ts_ms', 'number'], ['prompt_tokens', 'number'], ['completion_tokens', 'number'],
    ['cache_hit', 'number'], ['cache_miss', 'number'], ['tree_chars', 'number'], ['tree_tasks', 'number'], ['tree_level', 'number'],
  ],
};

// Credenciais (tipo do n8n → nome padrão exibido). O id real é descoberto na instância pelo setup.
export const CREDENCIAIS = {
  googleCalendarOAuth2Api: 'Google Calendar account',
};
