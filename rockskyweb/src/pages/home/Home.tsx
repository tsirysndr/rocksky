import styled from "@emotion/styled";
import { Search } from "@styled-icons/evaicons-solid";
import { BlockProps } from "baseui/block";
import { Button } from "baseui/button";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { Input } from "baseui/input";
import { HeadingMedium, LabelMedium } from "baseui/typography";

const Container = styled.div`
  display: flex;
  justify-content: center;
  height: 100vh;
  overflow-y: auto;
  flex-direction: row;
`;

const Flex = styled.div`
  display: flex;
  width: 770px;
  margin-top: 50px;
  flex-direction: column;
  margin-bottom: 200px;
`;

const Navbar = styled.div`
  position: fixed;
  top: 0;
  background-color: #fff;
  width: 100%;
  z-index: 1;
`;

const Cover = styled.img`
  border-radius: 8px;
  height: 240px;
  width: 240px;
  margin-bottom: 10px;
`;

const itemProps: BlockProps = {
  display: "flex",
  alignItems: "flex-start",
  flexDirection: "column",
};

const SongTitle = styled.div`
  color: #fff;
  font-size: 18px;
  text-decoration-color: rgb(255, 255, 255);
  text-decoration-line: none;
  text-decoration-style: solid;
  text-decoration-thickness: auto;
  text-shadow: rgba(0, 0, 0, 0.8) 0px 0px 10px;
  text-size-adjust: 100%;
  font-weight: 600;
  font-family: RockfordSansRegular;
`;
const Artist = styled.div`
  color: #fff;
  font-size: 14px;
  text-decoration-color: rgb(255, 255, 255);
  text-decoration-line: none;
  text-decoration-style: solid;
  text-decoration-thickness: auto;
  text-shadow: rgba(0, 0, 0, 0.8) 0px 0px 10px;
  text-size-adjust: 100%;
  font-family: RockfordSansRegular;
`;

const Metadata = styled.div`
  position: absolute;
  bottom: 15px;
  padding: 15px;
`;

const CoverWrapper = styled.div`
  position: relative;
`;

const Home = () => {
  return (
    <>
      <Container>
        <Flex>
          <Navbar>
            <h2 style={{ color: "#ff2876" }}>Rocksky</h2>
          </Navbar>
          <HeadingMedium marginTop={"50px"} marginBottom={"20px"}>
            Recently played
          </HeadingMedium>

          <div style={{ paddingBottom: 100 }}>
            <FlexGrid
              flexGridColumnCount={3}
              flexGridColumnGap="scale800"
              flexGridRowGap="scale800"
            >
              <FlexGridItem {...itemProps}>
                <CoverWrapper>
                  <Cover src="https://resources.tidal.com/images/56f4b51a/099f/4a3f/bb38/b78b558f8e2a/320x320.jpg" />
                  <Metadata>
                    <SongTitle>Is It You</SongTitle>
                    <Artist>Kid Ink</Artist>
                  </Metadata>
                </CoverWrapper>
                <LabelMedium color={"#ff2876"}>
                  @tsiry-sandratraina.com
                </LabelMedium>
                <LabelMedium>is listening to this song</LabelMedium>
                <LabelMedium color="#42576ca6">2 minutes ago</LabelMedium>
              </FlexGridItem>
              <FlexGridItem {...itemProps}>
                <CoverWrapper>
                  <Cover src="https://resources.tidal.com/images/cfd3ed25/5ce9/4f13/95e2/af38000abcea/320x320.jpg" />
                  <Metadata>
                    <SongTitle>Down (feat. Gucci Mane)</SongTitle>
                    <Artist>Fifth Harmony, Gucci Mane</Artist>
                  </Metadata>
                </CoverWrapper>
                <LabelMedium color={"#ff2876"}>
                  @tsiry-sandratraina.com
                </LabelMedium>
                <LabelMedium>is listening to this song</LabelMedium>
                <LabelMedium color="#42576ca6">5 minutes ago</LabelMedium>
              </FlexGridItem>
              <FlexGridItem {...itemProps}>
                <CoverWrapper>
                  <Cover src="https://resources.tidal.com/images/047c68f0/035e/4714/b21d/b6754925eec5/320x320.jpg" />
                  <Metadata>
                    <SongTitle>
                      Spectrum (Say My Name)(Calvin Harris Remix)
                    </SongTitle>
                    <Artist>Florence + the Machine</Artist>
                  </Metadata>
                </CoverWrapper>
                <LabelMedium color={"#ff2876"}>
                  @tsiry-sandratraina.com
                </LabelMedium>
                <LabelMedium>is listening to this song</LabelMedium>
                <LabelMedium color="#42576ca6">10 minutes ago</LabelMedium>
              </FlexGridItem>
              <FlexGridItem {...itemProps}>
                <CoverWrapper>
                  <Cover src="https://resources.tidal.com/images/aaf47204/a98f/42b1/b740/4512e5fd63cc/320x320.jpg" />
                  <Metadata>
                    <SongTitle>Rules</SongTitle>
                    <Artist>Tensnake, Chenai</Artist>
                  </Metadata>
                </CoverWrapper>
                <LabelMedium color={"#ff2876"}>
                  @tsiry-sandratraina.com
                </LabelMedium>
                <LabelMedium>is listening to this song</LabelMedium>
                <LabelMedium color="#42576ca6">14 minutes ago</LabelMedium>
              </FlexGridItem>
              <FlexGridItem {...itemProps}>
                <CoverWrapper>
                  <Cover src="https://resources.tidal.com/images/0c5bcae9/9cd8/4f57/abe8/39cb3603531e/320x320.jpg" />
                  <Metadata>
                    <SongTitle>Younger (Kygo Remix)</SongTitle>
                    <Artist>Seinabo Sey</Artist>
                  </Metadata>
                </CoverWrapper>
                <LabelMedium color={"#ff2876"}>
                  @tsiry-sandratraina.com
                </LabelMedium>
                <div>is listening to this song</div>
                <LabelMedium color="#42576ca6">16 minutes ago</LabelMedium>
              </FlexGridItem>
              <FlexGridItem {...itemProps}>
                <CoverWrapper>
                  <Cover src="https://resources.tidal.com/images/bf6acd27/971f/491a/805e/904a97dba5fa/320x320.jpg" />
                  <Metadata>
                    <SongTitle>My Love</SongTitle>
                    <Artist>Route 94, Jess Glynne</Artist>
                  </Metadata>
                </CoverWrapper>
                <LabelMedium color={"#ff2876"}>
                  @tsiry-sandratraina.com
                </LabelMedium>
                <LabelMedium>is listening to this song</LabelMedium>
                <LabelMedium color="#42576ca6">20 minutes ago</LabelMedium>
              </FlexGridItem>
              <FlexGridItem {...itemProps}>
                <CoverWrapper>
                  <Cover src="https://resources.tidal.com/images/5bdb9617/5989/41d9/ae7b/37dab67dc4ad/320x320.jpg" />
                  <Metadata>
                    <SongTitle>Tuesday (feat. Drake)</SongTitle>
                    <Artist>ILOVEMAKONNEN, Drake</Artist>
                  </Metadata>
                </CoverWrapper>
                <LabelMedium color={"#ff2876"}>
                  @tsiry-sandratraina.com
                </LabelMedium>
                <LabelMedium>is listening to this song</LabelMedium>
                <LabelMedium color="#42576ca6">24 minutes ago</LabelMedium>
              </FlexGridItem>
              <FlexGridItem {...itemProps}>
                <CoverWrapper>
                  <Cover src="https://resources.tidal.com/images/3f7faf20/4187/4349/ba01/6711ff0556f4/320x320.jpg" />
                  <Metadata>
                    <SongTitle>Peace Of Mind</SongTitle>
                    <Artist>Rema</Artist>
                  </Metadata>
                </CoverWrapper>
                <LabelMedium color={"#ff2876"}>
                  @tsiry-sandratraina.com
                </LabelMedium>
                <LabelMedium>is listening to this song</LabelMedium>
                <LabelMedium color="#42576ca6">27 minutes ago</LabelMedium>
              </FlexGridItem>
              <FlexGridItem {...itemProps}>
                <CoverWrapper>
                  <Cover src="https://resources.tidal.com/images/84d0eddf/1644/4009/92a6/6778a347732a/320x320.jpg" />
                  <Metadata>
                    <SongTitle>Soundgasm</SongTitle>
                    <Artist>Rema</Artist>
                  </Metadata>
                </CoverWrapper>
                <LabelMedium color={"#ff2876"}>
                  @tsiry-sandratraina.com
                </LabelMedium>
                <LabelMedium>is listening to this song</LabelMedium>
                <LabelMedium color="#42576ca6">31 minutes ago</LabelMedium>
              </FlexGridItem>
              <FlexGridItem {...itemProps}>
                <CoverWrapper>
                  <Cover src="https://resources.tidal.com/images/c717c2a1/32c5/4072/9680/91a5b675656d/320x320.jpg" />
                  <Metadata>
                    <SongTitle>Matter</SongTitle>
                    <Artist>Patoranking, Tiwa Savage</Artist>
                  </Metadata>
                </CoverWrapper>
                <LabelMedium color={"#ff2876"}>
                  @tsiry-sandratraina.com
                </LabelMedium>
                <LabelMedium>is listening to this song</LabelMedium>
                <LabelMedium color="#42576ca6">31 minutes ago</LabelMedium>
              </FlexGridItem>
            </FlexGrid>
          </div>
        </Flex>
        <div style={{ position: "relative", width: 300 }}>
          <div
            style={{
              position: "fixed",
              top: 100,
              width: 300,
              padding: 20,
            }}
          >
            <div>
              <Input
                startEnhancer={<Search size={20} color="#42576ca6" />}
                placeholder="Search"
                clearable
                clearOnEscape
              />
            </div>
            <div style={{ marginTop: 40 }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ marginBottom: 15 }}>
                  <LabelMedium>Bluesky handle</LabelMedium>
                </div>
                <Input
                  startEnhancer={<div style={{ color: "#42576ca6" }}>@</div>}
                  placeholder="tsiry.bsky.social"
                />
              </div>
              <Button
                overrides={{
                  BaseButton: {
                    style: {
                      width: "100%",
                      backgroundColor: "#ff2876",
                      ":hover": {
                        backgroundColor: "#ff2876",
                      },
                      ":focus": {
                        backgroundColor: "#ff2876",
                      },
                    },
                  },
                }}
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </>
  );
};

export default Home;
