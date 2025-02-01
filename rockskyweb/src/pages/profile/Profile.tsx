import styled from "@emotion/styled";
import { Avatar } from "baseui/avatar";
import { HeadingMedium, LabelLarge } from "baseui/typography";
import { useAtomValue } from "jotai";
import { profileAtom } from "../../atoms/profile";
import Main from "../../layouts/Main";

const Group = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
`;

function Profile() {
  const profile = useAtomValue(profileAtom);

  return (
    <>
      <Main>
        <div style={{ paddingBottom: 100, paddingTop: 75 }}>
          <Group>
            <div style={{ marginRight: 20 }}>
              <Avatar
                name={profile?.displayName}
                src={profile?.avatar}
                size="150px"
              />
            </div>
            <div>
              <HeadingMedium marginBottom={0}>
                {profile?.displayName}
              </HeadingMedium>
              <LabelLarge>
                <a
                  href={`https://bsky.app/profile/${profile?.handle}`}
                  style={{
                    textDecoration: "none",
                    color: "#ff2876",
                  }}
                >
                  @{profile?.handle}
                </a>
              </LabelLarge>
            </div>
          </Group>
        </div>
      </Main>
    </>
  );
}

export default Profile;
