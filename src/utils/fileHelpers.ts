
/**
 * Converts selected files (Images) to Data URLs.
 */
export const filesToImages = async (files: File[]): Promise<string[]> => {
    const promises = files.map(file => {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    });
    return Promise.all(promises);
};
