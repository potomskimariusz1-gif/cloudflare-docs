import type { RSSFeedItem } from "@astrojs/rss";
import { getCollection, getEntries, type CollectionEntry } from "astro:content";
import { rehype } from "rehype";
import { entryToString } from "~/util/container";
import rehypeFilterElements from "~/plugins/rehype/filter-elements";

type DocsToChangelogOptions = {
	name: string;
	product: string;
	entry: CollectionEntry<"docs">;
};

function docsToChangelog({
	name,
	product,
	entry,
}: DocsToChangelogOptions): CollectionEntry<"changelogs-next"> {
	const { data } = entry;
	const { title, changelog } = data;

	let date;
	if (changelog?.date) {
		date = changelog.date;
	} else {
		date = new Date(data.title.split(" ")[0]);
	}

	const iso8601 = date.toISOString().slice(0, 10);

	return {
		...entry,
		collection: "changelogs-next",
		data: {
			title,
			description: `${name} - ${iso8601}`,
			date,
			products: [{ collection: "products", id: product }],
			link: `/${entry.id}/`,
		},
	};
}

type GetChangelogsOptions = {
	filter?: (entry: CollectionEntry<"changelogs-next">) => boolean;
};

export async function getChangelogs({
	filter,
}: GetChangelogsOptions): Promise<Array<CollectionEntry<"changelogs-next">>> {
	let entries = await getCollection("changelogs-next");

	entries = entries.map((e) => {
		e.data.link = `/changelog-next/${e.id}/`;

		return e;
	});

	const ddosHttp = await getCollection("docs", (e) => {
		return (
			e.id.startsWith("ddos-protection/change-log/http/") &&
			e.data.pcx_content_type === "changelog"
		);
	});

	ddosHttp
		.map((e) =>
			docsToChangelog({
				name: "HTTP DDoS managed ruleset",
				product: "ddos-protection",
				entry: e,
			}),
		)
		.forEach((e) => entries.push(e));

	const ddosNetwork = await getCollection("docs", (e) => {
		return (
			e.id.startsWith("ddos-protection/change-log/network/") &&
			e.data.pcx_content_type === "changelog"
		);
	});

	ddosNetwork
		.map((e) =>
			docsToChangelog({
				name: "Network-layer DDoS managed ruleset",
				product: "ddos-protection",
				entry: e,
			}),
		)
		.forEach((e) => entries.push(e));

	const waf = await getCollection("docs", (e) => {
		return (
			e.id.startsWith("waf/change-log/") &&
			e.data.pcx_content_type === "changelog"
		);
	});

	waf
		.map((e) =>
			docsToChangelog({
				name: "WAF",
				product: "waf",
				entry: e,
			}),
		)
		.forEach((e) => entries.push(e));

	if (filter) {
		entries = entries.filter((e) => filter(e));
	}

	return entries.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

type GetRSSItemsOptions = {
	notes: Array<CollectionEntry<"changelogs-next">>;
	locals: App.Locals;
};

export async function getRSSItems({
	notes,
	locals,
}: GetRSSItemsOptions): Promise<Array<RSSFeedItem>> {
	return await Promise.all(
		notes.map(async (note) => {
			const { title, description, date, products, link } = note.data;

			const productEntries = await getEntries(products);
			const productTitles = productEntries.map((p) => p.data.name);

			const html = await entryToString(note, locals);
			const file = await rehype()
				.data("settings", {
					fragment: true,
				})
				.use(rehypeFilterElements)
				.process(html);

			const content = String(file);

			return {
				title: `${productTitles.join(", ")} - ${title}`,
				description,
				content,
				pubDate: date,
				categories: productTitles,
				link,
			};
		}),
	);
}
