import { Spotify } from '@styled-icons/boxicons-logos';
import { IconBrandLastfm, IconBrandTidal } from '@tabler/icons-react';
import { Button } from "baseui/button";
import { HeadingMedium } from "baseui/typography";
import { useAtomValue } from 'jotai';
import { profileAtom } from '../../atoms/profile';
import { API_URL } from '../../consts';
import { useProfileByDidQuery } from '../../hooks/useProfile';
import Main from "../../layouts/Main";

const Settings = () => {
  const profile = useAtomValue(profileAtom);
  const { data, refetch, isLoading } = useProfileByDidQuery(profile?.did);

  const onConnectLastFm = async () => {
    if (profile?.lastfmConnected) {
      await fetch(`${API_URL}/lastfm/disconnect`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      await refetch({
        throwOnError: true,
        cancelRefetch: true
      });
      return;
    }
    const loginUrl = new URL(`${API_URL}/lastfm/login`);
    loginUrl.searchParams.set('did', profile!.did);
    window.location.href = loginUrl.href;
  }

  const onConnectSpotify = async () => {
    if (profile?.spotifyConnected) {
       await fetch(`${API_URL}/spotify/disconnect`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      await refetch({
        throwOnError: true,
        cancelRefetch: true
      });
      return;
    }

    const response = await fetch(`${API_URL}/spotify/login`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    const data = await response.json();
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
    }
  }

  const onConnectTidal = async () => {
    if (profile?.tidalConnected) {
       await fetch(`${API_URL}/tidal/disconnect`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      await refetch({
        throwOnError: true,
        cancelRefetch: true
      });
      return;
    }
    const loginUrl = new URL(`${API_URL}/tidal/login`);
    loginUrl.searchParams.set('did', profile!.did);
    const { redirectUrl } = await fetch(loginUrl.href).then(res => res.json());
    window.location.href = redirectUrl;
  }

	return (
		<Main withRightPane={false}>
			<div className="flex-row justify-between mb-8 mt-[70px] flex">
				<HeadingMedium
					marginTop={"0px"}
					marginBottom={"40px"}
					className="!text-[var(--color-text)]"
				>
					Settings
				</HeadingMedium>
			</div>
			<div className="mb-[30px] flex-row justify-between flex items-center">
				<div className="mb-[25px] flex-row justify-between flex ">
          <IconBrandLastfm size={28} className='mr-[15px] mt-[3px]'/>
          <div>
           <div style={{ fontWeight: "bold" }} className='text-[19px]'>Last.fm</div>
            <p className="m-[2px]">
              Sync your listening history from Last.fm to Rocksky
            </p>
          </div>
				</div>
				{
          !isLoading && profile && <Button
          onClick={onConnectLastFm}
					overrides={{
						BaseButton: {
							style: () => ({
								backgroundColor: "var(--color-purple) !important",
								color: "var(--color-button-text) !important",
								borderRadius: "2px",
                height: "45px",
                width: '115.27px'
							}),
						},
					}}
				>
					{data?.lastfmConnected ? 'Disconnect' : 'Connect'}
				</Button>
      }
			</div>
			<div className="mb-[30px]  flex-row justify-between flex items-center">
				<div className="mb-[25px] flex-row justify-between flex">
          <Spotify size={28} className='mr-[15px] mt-[3px]'/>
					<div>
            <div style={{ fontWeight: "bold" }} className='text-[19px]'>Spotify</div>
              <p className="m-[2px]">
                Connect your Spotify account to sync your music library and listening data
              </p>
            </div>
				  </div>
          {
            !isLoading && profile && <Button
            onClick={onConnectSpotify}
            overrides={{
              BaseButton: {
                style: () => ({
                  backgroundColor: "var(--color-purple) !important",
                  color: "var(--color-button-text) !important",
                  borderRadius: "2px",
                  height: "45px",
                  width: '115.27px'
                }),
              },
            }}
          >
            {data?.spotifyConnected ? 'Disconnect' : 'Connect'}
          </Button>
      }
			</div>
			<div className="mb-[25px] flex-row justify-between flex items-center">
				<div className='flex-row flex'>
          <IconBrandTidal size={28} className='mr-[15px]' />
          <div>
            <div style={{ fontWeight: "bold" }} className='text-[19px]'>Tidal</div>
            <p className="m-[2px]">
              Connect your Tidal account to sync your music library
            </p>
          </div>
				</div>
        {
          !isLoading && profile &&
            <Button
              onClick={onConnectTidal}
              overrides={{
                BaseButton: {
                  style: () => ({
                    backgroundColor: "var(--color-purple) !important",
                    color: "var(--color-button-text) !important",
                    borderRadius: "2px",
                    height: "45px",
                    width: '115.27px'
                  }),
                },
              }}
            >
              {data?.tidalConnected ? 'Disconnect' : 'Connect'}
            </Button>
      }
			</div>
		</Main>
	);
};

export default Settings;
