// Job processor
export {
  createJob,
  getNextJob,
  completeJob,
  failJob,
  cancelJob,
  processJob,
  processJobs,
  getJobStats,
  cleanupOldJobs,
  registerJobHandler,
  jobs,
  type Job,
  type JobType,
  type JobStatus,
  type JobResult,
} from './processor'

// Register handlers on import
import './handlers'
