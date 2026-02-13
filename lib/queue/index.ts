/**
 * High-Throughput Queue Module
 *
 * Priority-based queue system with parallel workers and circuit breakers.
 */

export {
  HighThroughputQueue,
  QueuePriority,
  createResearchQueue,
  getResearchQueue,
  type QueueItem,
  type QueueItemStatus,
  type WorkerConfig,
  type QueueMetrics,
} from './high-throughput-queue';
