const jobRepository = require('../repositories/jobRepository');

class JobService {
  getJob(id) {
    const job = jobRepository.getById(id);
    if (!job) {
      throw new Error(`Job not found with ID: ${id}`);
    }
    return job;
  }

  getJobsByBook(bookId) {
    return jobRepository.getByBookId(bookId);
  }

  getRecentJobs(limit = 20) {
    return jobRepository.getAll(limit);
  }
}

module.exports = new JobService();
