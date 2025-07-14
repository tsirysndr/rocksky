import { EllipsisHorizontal } from "@styled-icons/ionicons-sharp";

function ContextMenu() {
  return (
    <>
      <div className="text-[var(--color-text)] cursor-pointer">
        <EllipsisHorizontal size={24} />
      </div>
    </>
  );
}

export default ContextMenu;
