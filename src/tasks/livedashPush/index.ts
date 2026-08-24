import axios from 'axios';
import { ENV } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { LiveDashPayload } from './types.js';

export async function runLivedashPush(): Promise<void> {
  const startTime = new Date();
  logger.info('[livedashPush] Starting Server B metric extraction and push...');

  const serverBBase = ENV.API.LIVEDASH_SOURCE_URL;
  const serverATarget = ENV.API.LIVEDASH_TARGET_URL;
  const syncKey = ENV.API.LIVEDASH_SYNC_KEY;

  logger.info(`[livedashPush] Source: ${serverBBase} | Target: ${serverATarget}`);

  const [avanceOei, eficienciaColaborador, eficienciaOperacion] = await Promise.all([
    axios
      .get(`${serverBBase}/api/AvanceOEI`)
      .then((res) => res.data)
      .catch((err) => {
        logger.warn(`[livedashPush] AvanceOEI request warning: ${err.message}`);
        return { Datos: [] };
      }),
    axios
      .get(`${serverBBase}/api/EficienciaColaborador`)
      .then((res) => res.data)
      .catch((err) => {
        logger.warn(`[livedashPush] EficienciaColaborador request warning: ${err.message}`);
        return { Datos: [] };
      }),
    axios
      .get(`${serverBBase}/api/EficienciaOperacion`)
      .then((res) => res.data)
      .catch((err) => {
        logger.warn(`[livedashPush] EficienciaOperacion request warning: ${err.message}`);
        return { Datos: [] };
      }),
  ]);

  const payload: LiveDashPayload = {
    avanceOei,
    eficienciaColaborador,
    eficienciaOperacion,
    pushedAt: new Date().toISOString(),
  };

  try {
    const response = await axios.post(serverATarget, payload, {
      headers: {
        'X-LIVEDASH-SYNC-KEY': syncKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

    logger.success(`[livedashPush] Push succeeded in ${durationSeconds}s. Response:`, response.data);
    logger.logToFile(
      'livedashPush',
      `[${startTime.toISOString()}] Push Success (${durationSeconds}s): ${JSON.stringify(response.data)}`
    );
  } catch (error: unknown) {
    const errorMsg = axios.isAxiosError(error)
      ? error.response?.data?.error || error.message
      : error instanceof Error
        ? error.message
        : String(error);

    logger.error(`[livedashPush] Push failed: ${errorMsg}`);
    logger.logToFile('livedashPush', `[${startTime.toISOString()}] Push Failed: ${errorMsg}`);
    throw error;
  }
}
