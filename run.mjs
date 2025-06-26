import * as nodeHtmlParser from "node-html-parser";
import stableStringify from "fast-json-stable-stringify";
import * as url from "node:url";

let buildRing = async (requester, firstUrl) => {
    let getNext = async url => {
        let splitWords = text => text.split(/\s+/).filter(s => s.length != 0);
        let compareWords = (a, b) => JSON.stringify(a) == JSON.stringify(b);
        let docText = await requester(url);
        if (docText == null) return null;
        let doc = nodeHtmlParser.parse(docText);
        for (let a of doc.getElementsByTagName("a")) {
            let words = splitWords(a.textContent.toLowerCase());
            if (compareWords(words, ["next", "buddy"])) {
                return a.attributes["href"];
            }
        }
        return null;
    };
    let visitedDomains = new Set();
    let ring = [];
    let currentUrl = firstUrl;
    for (;;) {
        ring.push(currentUrl);
        let hostname = new url.URL(currentUrl).hostname;
        if (visitedDomains.has(hostname)) {
            return { trapped: ring };
        }
        visitedDomains.add(hostname);
        currentUrl = await getNext(currentUrl);
        if (currentUrl == null) {
            return { broken: ring }
        }
        if (currentUrl == firstUrl) {
            return { complete: ring };
        }
    }
};

{
    let assertEqual = (a, b) => {
        let as = stableStringify(a);
        let bs = stableStringify(b);
        if (as != bs) {
            throw new Error(`${as} != ${bs}`);
        }
    };
    assertEqual(
        { complete: ["https://test1.com", "https://test2.com"] },
        await buildRing(async url => {
            if (url == "https://test1.com") {
                return `<html><body><p>My site</p><a href="https://test2.com"> next  buddy </a></p></body></html>`;
            }
            if (url == "https://test2.com") {
                return `<html><body><img alt="" src="test.png"><a href="https://test1.com">nEXT BUDDY</a></p></body></html>`;
            }
            return null;
        }, "https://test1.com"),
    );
    assertEqual(
        { broken: ["https://test1.com", "https://test2.com", "https://test3.com"] },
        await buildRing(async url => {
            if (url == "https://test1.com") {
                return `<a href="https://test2.com">next buddy</a>`;
            }
            if (url == "https://test2.com") {
                return `<a href="https://test3.com">next buddy</a>`;
            }
            return null;
        }, "https://test1.com"),
    );
    assertEqual(
        { broken: ["https://test1.com", "https://test2.com"] },
        await buildRing(async url => {
            if (url == "https://test1.com") {
                return `<a href="https://test2.com">next buddy</a>`;
            }
            if (url == "https://test2.com") {
                return `<a href="https://test1.com">not next buddy</a>`;
            }
            return null;
        }, "https://test1.com"),
    );
    assertEqual(
        { trapped: ["https://test1.com", "https://test2.com", "https://test2.com/trap1"] },
        await buildRing(async url => {
            if (url == "https://test1.com") {
                return `<a href="https://test2.com">next buddy</a>`;
            }
            if (url == "https://test2.com") {
                return `<a href="https://test2.com/trap1">next buddy</a>`;
            }
            if (url == "https://test2.com/trap1") {
                return `<a href="https://test2.com/trap2">next buddy</a>`;
            }
            if (url == "https://test2.com/trap2") {
                return `<a href="https://test2.com/trapN">next buddy</a>`;
            }
            return null;
        }, "https://test1.com"),
    );
}
