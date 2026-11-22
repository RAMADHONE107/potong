import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.chdir('/data/data/com.termux/files/home/potong');
// Use tsx-like? no. Instead, just dynamically import the built server chunks isn't easy.
// Simpler: inline the worker logic by calling runPipeline via ts-node/strip-types workaround.
console.log('fallback');
