import dayjs from "dayjs";
import type { Profile } from "../../types/profile";

export type HeaderProps = {
  profile: Profile;
};

function Header(props: HeaderProps) {
  const end = dayjs();
  const start = end.subtract(7, "day");
  const range = `${start.format("DD MMM YYYY")} — ${end.format("DD MMM YYYY")}`;

  return (
    <>
      <div className="flex flex-row items-center mb-[20px]">
        <div className="flex flex-1 items-center">
          <a
            href={`https://rocksky.app/profile/${props.profile.handle}`}
            target="_blank"
          >
            <img
              className="max-h-[25px] max-w-[25px] rounded-full mr-[10px]"
              src={props.profile.avatar}
            />
          </a>
          <a
            href={`https://rocksky.app/profile/${props.profile.handle}`}
            target="_blank"
            className="no-underline text-inherit"
          >
            <div className="text-[14px] mt-[-6px]">@{props.profile.handle}</div>
          </a>
          <span className="text-[14px] mt-[-3px] ml-[5px] mr-[5px]">|</span>
          <span className="text-[13px] mt-[-3px]">{range}</span>
        </div>

        <a
          href="https://rocksky.app"
          className="text-inherit no-underline"
          target="_blank"
        >
          <div className="flex flex-row items-center ">
            <img
              className="max-h-[18px] max-w-[18px] mr-[8px] "
              src="/public/logo.png"
            />
            <span className="text-[15px]">Rocksky</span>
          </div>
        </a>
      </div>
    </>
  );
}

export default Header;
