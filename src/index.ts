import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Props } from './auth/props';
import { tickTickAuthHandler } from './auth/ticktick-auth-handler';
import { Env } from './types/env';
import { registerTickTickTools } from './mcp/tools/register-tools';

export class TickMcpAgent extends McpAgent<Env, unknown, Props> {
  server = new McpServer({
    name: 'ticktick-mcp-server',
    version: '0.1.0',
  });

  async init() {
    if (!this.props) {
      throw new Error('Missing auth props — user must authorize via OAuth first');
    }
    registerTickTickTools(this.server, this.env, this.props);
  }
}

export default new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: TickMcpAgent.serve('/mcp'),
  defaultHandler: tickTickAuthHandler as ExportedHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
});
