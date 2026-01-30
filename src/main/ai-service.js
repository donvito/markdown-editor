const https = require('https');
const http = require('http');
const { URL } = require('url');
const pluginManager = require('./plugin-manager');

async function makeAIRequest(pluginId, endpoint, payload) {
  const apiKey = pluginManager.getSetting(pluginId, 'apiKey');
  const baseUrl = pluginManager.getSetting(pluginId, 'baseUrl') || 'https://api.openai.com/v1';
  const model = pluginManager.getSetting(pluginId, 'model') || 'gpt-4o';

  if (!apiKey) {
    throw new Error('API key not configured. Please set it in plugin settings.');
  }

  // Construct full URL
  const fullUrl = baseUrl.endsWith('/') ? `${baseUrl}${endpoint}` : `${baseUrl}/${endpoint}`;
  const url = new URL(fullUrl);

  const requestBody = JSON.stringify({
    model,
    ...payload
  });

  const protocol = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = protocol.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const errorMsg = parsed.error?.message || `API Error ${res.statusCode}`;
            reject(new Error(errorMsg));
          }
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Network error: ${error.message}`));
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(requestBody);
    req.end();
  });
}

// Streaming version - sends chunks via callback
function makeAIRequestStream(pluginId, endpoint, payload, onChunk, onDone, onError) {
  const apiKey = pluginManager.getSetting(pluginId, 'apiKey');
  const baseUrl = pluginManager.getSetting(pluginId, 'baseUrl') || 'https://api.openai.com/v1';
  const model = pluginManager.getSetting(pluginId, 'model') || 'gpt-4o';

  if (!apiKey) {
    onError(new Error('API key not configured. Please set it in plugin settings.'));
    return;
  }

  const fullUrl = baseUrl.endsWith('/') ? `${baseUrl}${endpoint}` : `${baseUrl}/${endpoint}`;
  const url = new URL(fullUrl);

  const requestBody = JSON.stringify({
    model,
    stream: true,
    ...payload
  });

  const protocol = url.protocol === 'https:' ? https : http;

  const req = protocol.request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(requestBody)
    }
  }, (res) => {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      let errorData = '';
      res.on('data', chunk => errorData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(errorData);
          onError(new Error(parsed.error?.message || `API Error ${res.statusCode}`));
        } catch {
          onError(new Error(`API Error ${res.statusCode}`));
        }
      });
      return;
    }

    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();

      // Process complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6); // Remove 'data: ' prefix

        if (data === '[DONE]') {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch {
          // Skip invalid JSON chunks
        }
      }
    });

    res.on('end', () => {
      onDone();
    });

    res.on('error', (error) => {
      onError(new Error(`Stream error: ${error.message}`));
    });
  });

  req.on('error', (error) => {
    onError(new Error(`Network error: ${error.message}`));
  });

  req.setTimeout(120000, () => {
    req.destroy();
    onError(new Error('Request timed out'));
  });

  req.write(requestBody);
  req.end();

  // Return abort function
  return () => req.destroy();
}

module.exports = { makeAIRequest, makeAIRequestStream };
