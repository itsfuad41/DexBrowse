// Built-in blocklists for the Shields engine (domain + all of its subdomains).
const ads = `
doubleclick.net googlesyndication.com googleadservices.com adservice.google.com
pagead2.googlesyndication.com 2mdn.net adnxs.com adsrvr.org advertising.com rubiconproject.com
pubmatic.com openx.net casalemedia.com indexww.com 33across.com sharethrough.com smartadserver.com
bidswitch.net criteo.com criteo.net taboola.com outbrain.com revcontent.com mgid.com zedo.com
amazon-adsystem.com media.net yieldmo.com teads.tv adform.net adition.com improvedigital.com
lijit.com sovrn.com triplelift.com spotxchange.com springserve.com contextweb.com gumgum.com
undertone.com conversantmedia.com adcolony.com applovin.com unityads.unity3d.com moatads.com
adsafeprotected.com serving-sys.com flashtalking.com popads.net propellerads.com exoclick.com
juicyads.com trafficjunky.net adsterra.com onclkds.com clickadu.com hilltopads.net
ads-twitter.com ads.linkedin.com ads.pinterest.com ads.yahoo.com adsymptotic.com ads.tiktok.com
smaato.net inmobi.com mopub.com vungle.com chartboost.com ironsrc.com supersonicads.com
adroll.com perfectaudience.com rtbhouse.com yandexadexchange.net an.yandex.ru adfox.ru
`.split(/\s+/).filter(Boolean);

const trackers = `
google-analytics.com googletagmanager.com googletagservices.com analytics.google.com stats.g.doubleclick.net
scorecardresearch.com quantserve.com quantcount.com hotjar.com hotjar.io mixpanel.com segment.io segment.com
cdn.segment.com amplitude.com fullstory.com mouseflow.com crazyegg.com clarity.ms bat.bing.com
demdex.net krxd.net bluekai.com exelator.com rlcdn.com everesttech.net mathtag.com tapad.com agkn.com
omtrdc.net 2o7.net adobedtm.com omniture.com newrelic.com nr-data.net bugsnag.com sentry-cdn.com
optimizely.com abtasty.com vwo.com kissmetrics.com heapanalytics.com heap.io mxpnl.com
pingdom.net chartbeat.com chartbeat.net parsely.com comscore.com imrworldwide.com nielsen.com
analytics.twitter.com analytics.tiktok.com px.ads.linkedin.com snap.licdn.com
connect.facebook.net pixel.facebook.com an.facebook.com analytics.yahoo.com ping.chartbeat.net
branch.io app.link adjust.com appsflyer.com kochava.com singular.net tune.com
yandex.ru/metrika mc.yandex.ru top-fwz1.mail.ru counter.yadro.ru hit.gemius.pl
tags.tiqcdn.com tealiumiq.com ensighten.com cxense.com permutive.com liveramp.com
addthis.com sharethis.com disqus.com/count serving.alexametrics.com alexametrics.com
matomo.cloud piwik.pro statcounter.com histats.com
`.split(/\s+/).filter((h) => h && !h.includes('/'));

module.exports = { ads: new Set(ads), trackers: new Set(trackers) };
