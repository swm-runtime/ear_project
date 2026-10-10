import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { theme } from '@/shared/theme';

const PHOTO_SIZE = 28;
const PHOTO_OVERLAP = 10;

interface ProfilePhotoStackProps {
  photos: { id: string; source: ImageSourcePropType }[];
}

/** 표시 전용 사진. 주제·커리어 정보는 카드의 접근성 라벨이 읽는다. */
export default function ProfilePhotoStack({ photos }: ProfilePhotoStackProps) {
  return (
    <View
      style={styles.stack}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {photos.map((photo, index) => (
        <View
          key={photo.id}
          style={[
            styles.frame,
            { marginLeft: index === 0 ? 0 : -PHOTO_OVERLAP, zIndex: photos.length - index },
          ]}
        >
          <Image source={photo.source} resizeMode="cover" style={styles.photo} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  frame: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: theme.color.surface,
    backgroundColor: theme.color.fillMuted,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
});
