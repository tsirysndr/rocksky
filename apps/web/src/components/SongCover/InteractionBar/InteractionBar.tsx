import HeartOutline from "../../Icons/HeartOutline";
import HeartFilled from "../../Icons/Heart";

function InteractionBar() {
  return (
    <div className="absolute bottom-[-1px] left-0 h-[100px] w-full bg-[linear-gradient(rgba(22,24,35,0)_2.92%,rgba(22,24,35,0.5)_98.99%)] flex justify-start items-end p-[10px] rounded-b-[8px]">
      <div className="h-[40px] w-full flex items-center">
        <span className="cursor-pointer" onClick={(e) => e.preventDefault()}>
          {true && <HeartOutline color="#fff" />}
          {false && <HeartFilled color="#fff" />}
        </span>
      </div>
    </div>
  );
}

export default InteractionBar;
