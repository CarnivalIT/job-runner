import sql from 'mssql';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbConfig = {
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    server: process.env.DB_SERVER_211 || 'localhost',
    database: process.env.DB_DATABASE_CTRL || 'test',
    options: {
        encrypt: false,
    }
};

interface RawInventoryItem {
    ESTILO: string;
    DESCRIPCION: string | null;
    COLOR: string;
    TALLA: string;
    COPA: string;
    CALIDAD: string;
    DISPONIBLE: number;
    RESERVA: number;
    FISICO: number;
}

interface InventoryPayloadItem {
    style: string;
    size: string;
    color: string;
    cup: string;
    available: number;
    reserved: number;
    description: string;
    quality: string;
}

const task = async () => {
    console.log('Inititating updateInventoryScript');
    const initialDate = new Date();
    let pool: sql.ConnectionPool | undefined;
    try {
        pool = new sql.ConnectionPool(dbConfig);
        await pool.connect();
        const result = await pool.query(`
            SELECT [ESTILO]
                  ,[DESCRIPCION]
                  ,[COLOR]
                  ,[TALLA]
                  ,[COPA]
                  ,[CALIDAD]
                  ,[DISPONIBLE]
                  ,[RESERVA]
                  ,[FISICO]
            FROM CCVW_INVENMAYV3
        `);

        const recordset = (result as { recordset: RawInventoryItem[] }).recordset;
        const payload = recordset.map((item): InventoryPayloadItem => {
            return {
                style: item.ESTILO,
                size: item.TALLA,
                color: item.COLOR,
                cup: item.COPA,
                available: item.DISPONIBLE,
                reserved: item.RESERVA,
                description: item.DESCRIPCION ?? '',
                quality: item.CALIDAD
            };
        }); 

        const inventoryResponse = await axios.post(
            'https://carnivaldevelop.ddns.net/stylesInformation/api/inventory/fill',
            { inventory: payload }
        );

        //Construct log msg
        const endDate = new Date();
        const diffInSeconds = (endDate.getTime() - initialDate.getTime()) / 1000;
        let logMsg = `Start time: ${initialDate.toString()}\n`;
        logMsg += `End time: ${endDate.toString()}\n`;
        logMsg += inventoryResponse.status === 200 || inventoryResponse.status === 201 ? `Inventory updated successfully\n` : `Inventory update failed\n`;
        if(inventoryResponse.status !== 200 && inventoryResponse.status !== 201) {
          logMsg += `Error: ${JSON.stringify(inventoryResponse.data)}\n`;
        }
        logMsg += `Total time: ${diffInSeconds} seconds\n`;

        const logPath = path.join(__dirname, '..', 'logs', 'updateInventory.txt');
        fs.appendFileSync(logPath, logMsg);
    } catch (err) {
	    console.error(err)
        const logPath = path.join(__dirname, '..', 'logs', 'updateInventory.txt');
        fs.appendFileSync(logPath, `Date: ${new Date().toString()} ,Error: ${err}\n`);
    } finally {
	console.log('updateInventory script finalized');
        if (pool) {
            pool.close();
        }
    }
}

task()

export default task;
