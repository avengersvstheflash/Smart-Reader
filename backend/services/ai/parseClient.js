'use strict';

const config = require('../../config');
const { resolveBaseUrl, checkReady } = require('./sidecarBase');
const FormData = global.FormData || require('form-data');
const { Blob } = require('buffer');

async function parseDocx(buffer, options = {}) {
  const targetUrl = resolveBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs || config.PYTHON_SIDECAR_TIMEOUT_MS || 30000;
  
  const formData = new FormData();
  formData.append('file', new Blob([buffer]), 'document.docx');
  
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await fetch(`${targetUrl}/v1/parse/docx`, {
      method: 'POST',
      body: formData,
      signal,
    });
    
    if (res.ok) {
      return await res.json();
    }
    
    if (res.status === 400) {
      const errBody = await res.json().catch(() => ({}));
      const err = new Error(errBody.detail?.message || 'Invalid DOCX format');
      err.code = 'INVALID_FORMAT';
      throw err;
    }
    
    const err = new Error(`Sidecar parsing failed with status ${res.status}`);
    err.code = 'PARSE_SIDECAR_FAILED';
    throw err;
  } catch (err) {
    if (err.code === 'INVALID_FORMAT' || err.code === 'PARSE_SIDECAR_FAILED') throw err;
    const unavailableErr = new Error('DOCX parsing requires the sidecar, which is currently unavailable. Please ensure the Python sidecar is running.');
    unavailableErr.code = 'PARSE_SIDECAR_UNAVAILABLE';
    unavailableErr.cause = err;
    throw unavailableErr;
  }
}

async function parseRtf(buffer, options = {}) {
  const targetUrl = resolveBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs || config.PYTHON_SIDECAR_TIMEOUT_MS || 30000;
  
  const formData = new FormData();
  formData.append('file', new Blob([buffer]), 'document.rtf');
  
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await fetch(`${targetUrl}/v1/parse/rtf`, {
      method: 'POST',
      body: formData,
      signal,
    });
    
    if (res.ok) {
      return await res.json();
    }
    
    if (res.status === 400) {
      const errBody = await res.json().catch(() => ({}));
      const err = new Error(errBody.detail?.message || 'Invalid RTF format');
      err.code = 'INVALID_FORMAT';
      throw err;
    }
    
    const err = new Error(`Sidecar parsing failed with status ${res.status}`);
    err.code = 'PARSE_SIDECAR_FAILED';
    throw err;
  } catch (err) {
    if (err.code === 'INVALID_FORMAT' || err.code === 'PARSE_SIDECAR_FAILED') throw err;
    const unavailableErr = new Error('RTF parsing requires the sidecar, which is currently unavailable. Please ensure the Python sidecar is running.');
    unavailableErr.code = 'PARSE_SIDECAR_UNAVAILABLE';
    unavailableErr.cause = err;
    throw unavailableErr;
  }
}

module.exports = { parseDocx, parseRtf };
