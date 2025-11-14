import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Booking Layout - Preserves state during booking flow
 * This prevents SeatSelection from remounting when navigating between booking steps
 */
const BookingLayout: React.FC = () => {
  return (
    <div className="booking-layout">
      <Outlet />
    </div>
  );
};

export default BookingLayout;