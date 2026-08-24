/* eslint-disable no-console */
/**
 * LIVEDASH EXTRACTION PUSH SCRIPT
 *
 * This script runs on Server B (or local dev environment).
 * It extracts data from the 3 Server B APIs:
 *   1. GET /api/AvanceOEI
 *   2. GET /api/EficienciaColaborador
 *   3. GET /api/EficienciaOperacion
 *
 * And pushes the combined payload to Server A's unified endpoint:
 *   POST /api/livedash
 *
 * Usage:
 *   npx tsx scripts/livedash-push.ts
 */

import axios from 'axios';
import 'dotenv/config';

const SERVER_B_BASE = process.env.LIVEDASH_SOURCE_URL || 'http://170.1.1.10:8012';
const SERVER_A_TARGET = process.env.LIVEDASH_TARGET_URL || 'http://localhost:3000/api/livedash';
const SYNC_KEY = process.env.LIVEDASH_SYNC_KEY || 'livedash-secret-key';

const pushLiveDash = async () => {
  console.log('====================================================');
  console.log('   🚀 LIVEDASH - SERVER B EXTRACTION & PUSH PROCESS ');
  console.log('====================================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Source API: ${SERVER_B_BASE}`);
  console.log(`Target Endpoint: ${SERVER_A_TARGET}`);

  console.log('\n[1/2] Fetching metrics from Server B APIs...');

  const [avanceOei, eficienciaColaborador, eficienciaOperacion] = await Promise.all([
    axios
      .get(`${SERVER_B_BASE}/api/AvanceOEI`)
      .then((res) => res.data)
      .catch((err) => {
        console.warn(` ⚠️ AvanceOEI request warning: ${err.message}`);
        return { Datos: [] };
      }),
    axios
      .get(`${SERVER_B_BASE}/api/EficienciaColaborador`)
      .then((res) => res.data)
      .catch((err) => {
        console.warn(` ⚠️ EficienciaColaborador request warning: ${err.message}`);
        return { Datos: [] };
      }),
    axios
      .get(`${SERVER_B_BASE}/api/EficienciaOperacion`)
      .then((res) => res.data)
      .catch((err) => {
        console.warn(` ⚠️ EficienciaOperacion request warning: ${err.message}`);
        return { Datos: [] };
      })
  ]);

  const payload = {
    avanceOei,
    eficienciaColaborador,
    eficienciaOperacion,
    pushedAt: new Date().toISOString()
  };

  console.log('\n[2/2] Pushing payload to Server A...');
  try {
    const response = await axios.post(SERVER_A_TARGET, payload, {
      headers: {
        'X-LIVEDASH-SYNC-KEY': SYNC_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log('✅ Push Success! Response:', response.data);
    console.log('====================================================\n');
  } catch (error: unknown) {
    const errorMsg = axios.isAxiosError(error)
      ? error.response?.data?.error || error.message
      : error instanceof Error
        ? error.message
        : String(error);
    console.error(`❌ Push Failed: ${errorMsg}`);
    console.log('====================================================\n');
    process.exit(1);
  }
};

pushLiveDash().catch((err) => {
  console.error('[Fatal Error] Script execution failed:', err);
  process.exit(1);
});
