import React from "react";
import { Offer } from "../../libs/types";
import OfferCard, { OfferCardProps } from "./OfferCard";

export interface OffersGridProps {
  offers: Offer[];
  onView: OfferCardProps["onView"];
  emptyMessage?: string;
}

const OffersGrid: React.FC<OffersGridProps> = ({ offers, onView, emptyMessage }) => {
  if (!offers.length) {
    return (
      <div className="rounded-3xl border border-dashed border-[#262629] bg-[#13131a] p-12 text-center text-sm text-gray-400">
        {emptyMessage || "No offers available at the moment. Please check back soon."}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} onView={onView} />
      ))}
    </div>
  );
};

export default OffersGrid;

