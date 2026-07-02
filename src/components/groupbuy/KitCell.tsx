import { formatKits } from '../../utils/groupBuyOverview';

type Props = {
  vials: number;
};

/** Bold kit count with the raw vial count as small subtext underneath. */
export function KitCell({ vials }: Props) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span>{formatKits(vials)}</span>
      <span className="text-[10px] font-normal text-gray-400">
        {vials} vial{vials === 1 ? '' : 's'}
      </span>
    </div>
  );
}

export default KitCell;
