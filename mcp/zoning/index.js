import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { handleToolCall } from './mcp-tool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest  = JSON.parse(readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));

let inputBuffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { inputBuffer += chunk; processBuffer(); });

function processBuffer() {
  const lines = inputBuffer.split('\n');
  inputBuffer  = lines.pop();
  for (const line of lines) { const t = line.trim(); if (t) handleMessage(t); }
}

async function handleMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { sendError(null, -32700, 'Parse error'); return; }
  const { id, method, params } = msg;
  try {
    switch (method) {
      case 'initialize':
        sendResult(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} },
          serverInfo: { name: manifest.name, version: manifest.version } }); break;
      case 'notifications/initialized': break;
      case 'tools/list':   sendResult(id, { tools: manifest.tools }); break;
      case 'tools/call': {
        const { name, arguments: args } = params;
        sendResult(id, await handleToolCall(name, args ?? {})); break;
      }
      default: sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) { sendError(id, -32603, err.message); }
}

function sendResult(id, result)        { send({ jsonrpc: '2.0', id, result }); }
function sendError(id, code, message)  { send({ jsonrpc: '2.0', id, error: { code, message } }); }
function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
