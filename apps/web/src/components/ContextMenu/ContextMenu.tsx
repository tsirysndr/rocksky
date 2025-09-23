import { Folder2, MusicNoteBeamed } from "@styled-icons/bootstrap";
import { EllipsisHorizontal } from "@styled-icons/ionicons-sharp";
import { NestedMenus, StatefulMenu } from "baseui/menu";
import { StatefulPopover } from "baseui/popover";

export type ContextMenuProps = {
	file: {
		id: string;
		name: string;
		type: string;
	};
};

function ContextMenu(props: ContextMenuProps) {
	const { file } = props;
	return (
		<StatefulPopover
			autoFocus={false}
			content={({ close }) => (
				<div className="border-[var(--color-border)] w-[240px] border-[1px] bg-[var(--color-background)] rounded-[6px]">
					<div
						className="h-[54px] flex flex-row items-center pl-[5px] pr-[5px]"
						style={{
							borderBottom: "1px solid var(--color-border)",
						}}
					>
						<div className="h-[43px] flex items-center justify-center ml-[10px] mr-[10px] text-[var(--color-text)]">
							{file.type == "folder" && (
								<div>
									<Folder2 size={20} />
								</div>
							)}
							{file.type !== "folder" && (
								<div>
									<MusicNoteBeamed size={20} />
								</div>
							)}
						</div>
						<div className="text-[var(--color-text)] whitespace-nowrap text-ellipsis overflow-hidden">
							{file.name}
						</div>
					</div>
					<NestedMenus>
						<StatefulMenu
							items={[
								{
									id: "0",
									label: "Play",
								},
								{
									id: "1",
									label: "Play Next",
								},
								{
									id: "2",
									label: "Add to Playlist",
								},
								{
									id: "3",
									label: "Play Last",
								},
								{
									id: "4",
									label: "Add Shuffled",
								},
							]}
							onItemSelect={({ item }) => {
								console.log(`Selected item: ${item.label}`);
								close();
							}}
							overrides={{
								List: {
									style: {
										boxShadow: "none",
										outline: "none !important",
										backgroundColor: "var(--color-background)",
									},
								},
								ListItem: {
									style: {
										backgroundColor: "var(--color-background)",
										color: "var(--color-text)",
										":hover": {
											backgroundColor: "var(--color-menu-hover)",
										},
									},
								},
								Option: {
									props: {
										getChildMenu: (item: { label: string }) => {
											if (item.label === "Add to Playlist") {
												return (
													<div className="border-[var(--color-border)] w-[205px] border-[1px] bg-[var(--color-background)] rounded-[6px]">
														<StatefulMenu
															items={{
																__ungrouped: [
																	{
																		label: "Create new playlist",
																	},
																],
															}}
															overrides={{
																List: {
																	style: {
																		boxShadow: "none",
																		outline: "none !important",
																		backgroundColor: "var(--color-background)",
																	},
																},
																ListItem: {
																	style: {
																		backgroundColor: "var(--color-background)",
																		color: "var(--color-text)",
																		":hover": {
																			backgroundColor:
																				"var(--color-menu-hover)",
																		},
																	},
																},
															}}
														/>
													</div>
												);
											}
											return null;
										},
									},
								},
							}}
						/>
					</NestedMenus>
				</div>
			)}
			overrides={{
				Inner: {
					style: {
						backgroundColor: "var(--color-background)",
					},
				},
			}}
		>
			<button className="text-[var(--color-text-muted)] cursor-pointer bg-transparent border-none hover:bg-transparent">
				<EllipsisHorizontal size={24} />
			</button>
		</StatefulPopover>
	);
}

export default ContextMenu;
