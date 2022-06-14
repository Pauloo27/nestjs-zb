import {
  Server,
  CustomTransportStrategy
} from '@nestjs/microservices';
import {
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  ZEEBE_CONNECTION_PROVIDER
} from '../zeebe.constans';
import {
  ZBClient,
} from 'zeebe-node';
import * as process from 'process';
import {
  ZeebeWorkerError,
  ZeebeWorkerProperties
} from '../zeebe.interfaces';

/**
 * A customer transport for Zeebe.
 *
 * @export
 * @class ZeebeServer
 * @extends {Server}
 * @implements {CustomTransportStrategy}
 */
@Injectable()
export class ZeebeServer extends Server implements CustomTransportStrategy {
  constructor(@Inject(ZEEBE_CONNECTION_PROVIDER) private readonly client: ZBClient) {
    super();
  }

  public async listen(callback: () => void) {
    this.init();
    callback();
  }

  public close() {
    this.client.close().then(() => console.log('All workers closed'))
  }

  private init(): void {
    const handlers = this.getHandlers();
    handlers.forEach((value, key: any, map) => {
      if (typeof key === 'string' && key.includes('{')) {
        try {
          const jsonKey = JSON.parse(key) as ZeebeWorkerProperties;
          let workerOptions = {
            taskType: jsonKey.type,
            id: `${jsonKey.type}_${process.pid}`,
            options: jsonKey.options || {},
            handler: async (job, complete, worker) => {
              try {
                const inputJob = {
                  ...job,
                  error: undefined, forward: undefined, complete: undefined,
                  fail: undefined, cancelWorkflow: undefined,
                };
                const result = value(inputJob, { complete, worker }) as any
                if (result instanceof Promise)
                  return job.complete(await result);

                return job.complete(result);
              } catch (e) {
                if (e instanceof ZeebeWorkerError) {
                  return job.error(e, e.message);
                }
                return job.error(e);
              }
            },
            onConnectionError: undefined
          }
          this.client.createWorker({
            id: workerOptions.id,
            taskHandler: workerOptions.handler,
            taskType: workerOptions.taskType,
            ...workerOptions.options
          });
        } catch (ex) {
          this.logger.error('Zeebe error:', ex);
        }
      }
    });
  }
}
