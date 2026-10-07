import { ASSET_BASE } from '../../render/sprites';
import { CARE_ITEMS } from '../../game/rescues/engine';
import type { CareItemId } from '../../game/types';

/** A care item's art (from public/assets-webp/care), with its emoji as the fallback. */
export function CareIcon({ item, size = 40 }: { item: CareItemId; size?: number }) {
  return (
    <img
      className="care-icon"
      src={`${ASSET_BASE}care/${item}.webp`}
      alt=""
      width={size}
      height={size}
      onError={(e) => {
        e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { textContent: CARE_ITEMS[item].icon }));
      }}
    />
  );
}

export const DrFisher = ({ size = 56 }: { size?: number }) => (
  <img className="dr-fisher" src={`${ASSET_BASE}dr_fisher.png`} alt="Dr. Fisher" width={size} height={size} />
);
