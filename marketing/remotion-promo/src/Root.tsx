import React from 'react';
import {Composition} from 'remotion';
import {Promo, TOTAL} from './Promo';
import {AppTour, APP_TOTAL} from './AppTour';
import {Scenarios, SCEN_TOTAL} from './Scenarios';
import {FeatureExplainer, featureDuration} from './FeatureExplainer';
import {FEATURES} from './featuresData';
import {SETTINGS_FEATURES} from './settingsData';
import {RemoteTalk, LocalRec, CloudRec, ANIM_DUR} from './SceneAnims';
import {RobotStory, STORY_DUR} from './RobotStory';
import {FeatureHighlights, FH_TOTAL} from './FeatureHighlights';
import {ScenarioStories, SS_TOTAL} from './ScenarioStories';

const allFeats = [...FEATURES, ...SETTINGS_FEATURES];
const ANIMS = [
  {id: 'remote', C: RemoteTalk},
  {id: 'localrec', C: LocalRec},
  {id: 'cloud', C: CloudRec},
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="PromoVertical" component={Promo} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
      <Composition id="PromoHorizontal" component={Promo} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
      <Composition id="AppTourVertical" component={AppTour} durationInFrames={APP_TOTAL} fps={30} width={1080} height={1920} />
      <Composition id="AppTourHorizontal" component={AppTour} durationInFrames={APP_TOTAL} fps={30} width={1920} height={1080} />
      <Composition id="ScenariosVertical" component={Scenarios} durationInFrames={SCEN_TOTAL} fps={30} width={1080} height={1920} />
      <Composition id="ScenariosHorizontal" component={Scenarios} durationInFrames={SCEN_TOTAL} fps={30} width={1920} height={1080} />
      {allFeats.map((f) => (
        <React.Fragment key={f.id}>
          <Composition id={'Feat-' + f.id + '-V'} component={FeatureExplainer} durationInFrames={featureDuration(f)} fps={30} width={1080} height={1920} defaultProps={{f}} />
          <Composition id={'Feat-' + f.id + '-H'} component={FeatureExplainer} durationInFrames={featureDuration(f)} fps={30} width={1920} height={1080} defaultProps={{f}} />
        </React.Fragment>
      ))}
      {ANIMS.map((a) => (
        <React.Fragment key={a.id}>
          <Composition id={'Anim-' + a.id + '-V'} component={a.C} durationInFrames={ANIM_DUR} fps={30} width={1080} height={1920} />
          <Composition id={'Anim-' + a.id + '-H'} component={a.C} durationInFrames={ANIM_DUR} fps={30} width={1920} height={1080} />
        </React.Fragment>
      ))}
      <Composition id="RobotStory-V" component={RobotStory} durationInFrames={STORY_DUR} fps={30} width={1080} height={1920} />
      <Composition id="RobotStory-H" component={RobotStory} durationInFrames={STORY_DUR} fps={30} width={1920} height={1080} />
      <Composition id="FeatureHighlights-H" component={FeatureHighlights} durationInFrames={FH_TOTAL} fps={30} width={1920} height={1080} />
      <Composition id="FeatureHighlights-V" component={FeatureHighlights} durationInFrames={FH_TOTAL} fps={30} width={1080} height={1920} />
      <Composition id="ScenarioStories-H" component={ScenarioStories} durationInFrames={SS_TOTAL} fps={30} width={1920} height={1080} />
    </>
  );
};
