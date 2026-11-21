import { get as httpGet, type IncomingMessage } from 'node:http';
import { get as httpsGet } from 'node:https';
import { performance } from 'node:perf_hooks';
import { URL } from 'node:url';

const requestCount = 10;
const requestTimeoutMilliseconds = 15_000;
const bytesPerMegabyte = 1_000_000;

function getResponse(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
    const get = url.protocol === 'https:' ? httpsGet : httpGet;
    return new Promise((resolve, reject) => {
        const request = get(url, { signal, headers: { 'Accept-Encoding': 'identity' } }, resolve);
        request.on('error', reject);
    });
}

async function download(url: URL, signal: AbortSignal): Promise<number> {
    const response = await getResponse(url, signal);
    const status = response.statusCode ?? 0;
    if (status < 200 || status >= 300) {
        response.destroy();
        throw new Error(`сервер вернул HTTP ${status}`);
    }

    let bytes = 0;
    for await (const chunk of response) {
        bytes += chunk.length;
    }
    return bytes;
}

async function main(args: string[]): Promise<void> {
    const [address] = args;
    if (args.length !== 1 || !address) {
        throw new Error('использование: node download-speed.mts <URL>');
    }

    const url = URL.parse(address);
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
        throw new Error('укажите абсолютный URL с протоколом HTTP или HTTPS');
    }

    let totalBytes = 0;
    let totalMilliseconds = 0;
    for (let number = 1; number <= requestCount; number++) {
        const start = performance.now();
        const signal = AbortSignal.timeout(requestTimeoutMilliseconds);
        try {
            totalBytes += await download(url, signal);
        } catch (error) {
            const message = signal.aborted ? 'таймаут запроса' : (error instanceof Error ? error.message : String(error));
            throw new Error(`запрос ${number} из ${requestCount}: ${message}`);
        }
        totalMilliseconds += performance.now() - start;
    }

    const averageMilliseconds = totalMilliseconds / requestCount;
    const megabytesPerSecond = (totalBytes / bytesPerMegabyte) / (totalMilliseconds / 1_000);

    console.log(`Запросов выполнено: ${requestCount}`);
    console.log(`Среднее время запроса: ${averageMilliseconds.toFixed(2)} мс`);
    console.log(`Общий объём скачанных данных: ${totalBytes} байт`);
    console.log(`Скорость скачивания: ${megabytesPerSecond.toFixed(3)} МБ/с`);
}

main(process.argv.slice(2)).catch((error: Error) => {
    console.error(`Ошибка: ${error.message}`);
    process.exitCode = 1;
});
