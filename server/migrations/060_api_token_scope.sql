-- Read-only personal access tokens. A token made with scope 'read' only gets the MCP tools and the HTTP operations
-- that read, and the API it calls refuses anything else. OAuth connections stay 'write' (the only OAuth scope is mcp).
alter table api_tokens add column if not exists scope text not null default 'write';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'api_tokens_scope_check') then
    alter table api_tokens add constraint api_tokens_scope_check check (scope in ('read','write'));
  end if;
end $$;
