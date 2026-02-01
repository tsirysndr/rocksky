import { useState } from "react";

export function Embed() {
  const [url, setUrl] = useState<string>(""); // Initialize with an empty string

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = (e.target as any).value;
    console.log("Input changed:", value); // Debugging log
    setUrl(value);

    if (
      value.match(
        /^https?:\/\/rocksky\.app\/did:plc:[a-z2-7]{24}\/scrobble\/[a-z0-9]{13,}$/,
      )
    ) {
      alert("ok");
    }
    alert("z");
  };

  return (
    <div className="min-h-screen  w-1/3 flex items-center justify-center m-auto">
      <div className="w-full">
        <h1 className="text-4xl font-bold text-gray-800 mb-4 text-center">
          Embed a Rocksky Scrobble
        </h1>
        {/*<iframe
          src="https://api.rocksky.app/embed/did:plc:7vdlgi2bflelz7mmuxoqjfcr/scrobble/3mdtacalsqs23"
          height={500}
          width={500}
          className="mt-[20px] border-none rounded-[10px]"
        />*/}
        <iframe
          src="https://api.rocksky.app/embed/u/tsiry-sandratraina.com/top/artists"
          height={500}
          width={600}
          className="mt-[20px] border-none rounded-[10px]"
        />
      </div>
    </div>
  );
}
