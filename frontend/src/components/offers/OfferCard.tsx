import React from "react";
import { Offer } from "../../libs/types";

export type { Offer } from "../../libs/types";

export interface OfferCardProps {
  offer: Offer;
  onView: (offer: Offer) => void;
}

const FALLBACK_IMAGE = "/images/placeholder_offer.jpg";

export function getOfferImage(offer: Offer) {
  return offer.banner_url || offer.image_url || offer.image || FALLBACK_IMAGE;
}

const OfferCard: React.FC<OfferCardProps> = ({ offer, onView }) => {
  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    (event.target as HTMLImageElement).src = FALLBACK_IMAGE;
  };

  const imageUrl = getOfferImage(offer);
  const partnerLogo = offer.partner_logo || offer.partnerLogo;

  return (
    <article
      className="group flex h-full flex-col rounded-3xl border border-[#262629] bg-gradient-to-br from-[#151518] via-[#1a1a1f] to-[#151518] p-4 shadow-[0_35px_90px_-65px_rgba(246,200,0,0.65)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_40px_120px_-70px_rgba(246,200,0,0.75)] focus-within:-translate-y-1 focus-within:shadow-[0_40px_120px_-70px_rgba(246,200,0,0.75)]"
      tabIndex={-1}
    >
      <div className="relative overflow-hidden rounded-2xl bg-[#111216]">
        <div className="relative aspect-[20/11] w-full overflow-hidden">
          <img
            src={imageUrl}
            alt={offer.title}
            loading="lazy"
            onError={handleImageError}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-80" />
        </div>
        {partnerLogo && (
          <div className="absolute left-4 top-4 inline-flex items-center justify-center overflow-hidden rounded-full border border-[#f6c800]/60 bg-[#0b0b0f]/90 p-1.5 shadow-[0_0_20px_rgba(246,200,0,0.32)]">
            <img
              src={partnerLogo}
              alt={`${offer.title} partner logo`}
              loading="lazy"
              className="h-10 w-10 object-contain"
              onError={handleImageError}
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 pt-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-wide text-white">
            {offer.title}
          </h3>
          {offer.description || offer.subtitle ? (
            <p className="text-sm text-gray-400 line-clamp-2">
              {offer.subtitle || offer.description}
            </p>
          ) : null}
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-gray-500">
            {offer.valid_till ? `Valid till: ${offer.valid_till}` : "Limited time offer"}
          </p>
        </div>

        <div className="mt-auto flex justify-end">
          <button
            type="button"
            onClick={() => onView(offer)}
            className="inline-flex items-center rounded-full bg-[#f6c800] px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-black shadow-[0_10px_30px_-18px_rgba(246,200,0,0.85)] transition hover:-translate-y-[1px] hover:shadow-[0_14px_40px_-16px_rgba(246,200,0,0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]/80"
            aria-label={`View offer: ${offer.title}`}
          >
            View
          </button>
        </div>
      </div>
    </article>
  );
};

export default OfferCard;

