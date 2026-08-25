import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useVideoPlayer, VideoView, VideoPlayer as ExpoVideoPlayer } from "expo-video";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { spacing, radius, font } from "@/src/theme/tokens";

type Props = {
  uri: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  showControls?: boolean;
};

export function VideoPlayer({ uri, autoplay = true, muted = true, loop = true, showControls = false }: Props) {
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayOpacity = useSharedValue(0);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
    if (autoplay) p.play();
  });

  useEffect(() => {
    if (!showControls) return;

    const statusSub = player.addListener("statusChange", (status) => {
      if (status.status === "readyToPlay") {
        setDuration(player.duration);
      }
    });

    const playingSub = player.addListener("playingChange", (playing) => {
      setIsPlaying(playing.isPlaying);
    });

    // Poll for current time since expo-video doesn't have a time update event
    const interval = setInterval(() => {
      if (player.currentTime !== undefined) {
        setCurrentTime(player.currentTime);
      }
    }, 250);

    return () => {
      statusSub.remove();
      playingSub.remove();
      clearInterval(interval);
    };
  }, [player, showControls]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, isPlaying]);

  const handleTap = useCallback(() => {
    if (!showControls) return;
    togglePlayback();
    setShowOverlay(true);
    overlayOpacity.value = withTiming(1, { duration: 150 });
    setTimeout(() => {
      overlayOpacity.value = withTiming(0, { duration: 300 });
      setTimeout(() => setShowOverlay(false), 300);
    }, 800);
  }, [showControls, togglePlayback, overlayOpacity]);

  const handleSeek = useCallback((position: number) => {
    player.currentTime = position;
    setCurrentTime(position);
  }, [player]);

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(handleTap)();
  });

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Feed mode: simple autoplay video
  if (!showControls) {
    return (
      <VideoView
        player={player}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        nativeControls={false}
      />
    );
  }

  // Detail mode: with custom controls
  return (
    <GestureDetector gesture={tapGesture}>
      <View style={styles.container}>
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          nativeControls={false}
        />

        {/* Play/Pause overlay */}
        {showOverlay && (
          <Animated.View style={[styles.overlay, overlayStyle]}>
            <View style={styles.playPauseCircle}>
              <MaterialCommunityIcons
                name={isPlaying ? "pause" : "play"}
                size={40}
                color="#FFFFFF"
              />
            </View>
          </Animated.View>
        )}

        {/* Bottom controls */}
        <View style={styles.controls}>
          <SeekBar
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>
      </View>
    </GestureDetector>
  );
}

type SeekBarProps = {
  currentTime: number;
  duration: number;
  onSeek: (position: number) => void;
};

function SeekBar({ currentTime, duration, onSeek }: SeekBarProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const translateX = useSharedValue(0);
  const trackWidth = useSharedValue(0);

  const handlePanUpdate = useCallback((x: number) => {
    if (trackWidth.value > 0) {
      const ratio = Math.max(0, Math.min(1, x / trackWidth.value));
      onSeek(ratio * duration);
    }
  }, [duration, onSeek, trackWidth]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      runOnJS(handlePanUpdate)(e.x);
    });

  const tapSeekGesture = Gesture.Tap()
    .onEnd((e) => {
      runOnJS(handlePanUpdate)(e.x);
    });

  const combinedGesture = Gesture.Race(panGesture, tapSeekGesture);

  return (
    <GestureDetector gesture={combinedGesture}>
      <View
        style={styles.seekTrack}
        onLayout={(e) => { trackWidth.value = e.nativeEvent.layout.width; }}
      >
        <View style={styles.seekBackground} />
        <View style={[styles.seekProgress, { width: `${progress}%` }]} />
        <View style={[styles.seekThumb, { left: `${progress}%` }]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  playPauseCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.xl,
    background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
  },
  seekTrack: {
    height: 24,
    justifyContent: "center",
  },
  seekBackground: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
  },
  seekProgress: {
    position: "absolute",
    height: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  seekThumb: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    marginLeft: -7,
    top: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  timeText: {
    fontFamily: font.medium,
    fontSize: 12,
    color: "#FFFFFF",
  },
});
