import type { Profile } from "../../types/profile";

export type HeaderProps = {
  profile: Profile;
};

function Header(props: HeaderProps) {
  return (
    <>
      <div className="flex flex-row mb-[20px]">
        <div className="flex flex-1 items-center">
          <div>
            <div className="flex items-center">
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
                <div className="text-[14px] mt-[-6px]">
                  @{props.profile.handle}
                </div>
              </a>
            </div>
          </div>
        </div>

        <div>
          <a
            href="https://rocksky.app"
            className="text-inherit no-underline"
            target="_blank"
          >
            <div className="flex flex-row items-start ">
              <img
                className="max-h-[18px] max-w-[18px] mr-[8px] "
                src="/public/logo.png"
              />
              <span className="text-[15px]">Rocksky</span>
            </div>
          </a>
        </div>
      </div>
    </>
  );
}

export default Header;
