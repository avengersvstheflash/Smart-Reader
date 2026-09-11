const express = require('express');
const jobService = require('../services/jobService');

const router = express.Router();

// GET /api/jobs - list recent processing jobs
router.get('/', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const jobs = jobService.getRecentJobs(limit);
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id - get status of a single job
router.get('/:id', (req, res, next) => {
  try {
    const job = jobService.getJob(req.params.id);
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/book/:bookId - get jobs for a book
router.get('/book/:bookId', (req, res, next) => {
  try {
    const jobs = jobService.getJobsByBook(req.params.bookId);
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
