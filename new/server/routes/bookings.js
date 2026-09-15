// server/routes/bookings.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const {
  listBookings,
  createBooking,
  updateBooking,
  deleteBooking,
} = require('../controllers/bookingsController');

router.use(authenticate);

router.get('/', listBookings);
router.post('/', createBooking);
router.put('/:id', updateBooking);
router.delete('/:id', deleteBooking);

module.exports = router;
