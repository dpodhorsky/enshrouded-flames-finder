// Icons of the place types. Loaded with the places, so the first page load does not fetch them.
const iconUrls = import.meta.glob<string>("./assets/pins/*.png", { eager: true, import: "default" });

export const placeIconUrl = (file: string) => iconUrls[`./assets/pins/${file}`] ?? "";
